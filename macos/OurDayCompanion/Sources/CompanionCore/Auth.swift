import Foundation

struct AuthSession: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userID: String
    var email: String
}

protocol SessionStorage {
    func load() -> AuthSession?
    func save(_ s: AuthSession)
    func clear()
}

final class MemorySessionStorage: SessionStorage {
    var value: AuthSession?
    func load() -> AuthSession? { value }
    func save(_ s: AuthSession) { value = s }
    func clear() { value = nil }
}

/// Talks to Supabase Auth (GoTrue) over REST. Same endpoints the official SDKs use; email + password only.
struct AuthClient {
    let config: SupabaseConfig
    let transport: HTTPTransport
    var now: () -> Date = Date.init

    private func request(_ path: String, query: String = "", body: [String: String]) throws -> URLRequest {
        var r = URLRequest(url: URL(string: config.url.absoluteString + "/auth/v1/" + path + query)!)
        r.httpMethod = "POST"
        r.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: body)
        return r
    }

    private struct TokenResponse: Decodable {
        struct U: Decodable { var id: String; var email: String? }
        var access_token: String; var refresh_token: String; var expires_in: Double?; var expires_at: Double?; var user: U
    }

    private func session(from data: Data, fallbackEmail: String) throws -> AuthSession {
        guard let t = try? JSONDecoder().decode(TokenResponse.self, from: data) else { throw AppError.decoding }
        let exp = t.expires_at.map { Date(timeIntervalSince1970: $0) } ?? now().addingTimeInterval(t.expires_in ?? 3600)
        return AuthSession(accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp, userID: t.user.id, email: t.user.email ?? fallbackEmail)
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        let req = try request("token", query: "?grant_type=password", body: ["email": email, "password": password])
        let (data, resp): (Data, HTTPURLResponse)
        do { (data, resp) = try await transport.send(req) } catch { throw classify(error) }
        switch resp.statusCode {
        case 200: return try session(from: data, fallbackEmail: email)
        case 400, 401, 403, 422: throw AppError.invalidCredentials
        default: throw AppError.server(resp.statusCode)
        }
    }

    func refresh(_ s: AuthSession) async throws -> AuthSession {
        let req = try request("token", query: "?grant_type=refresh_token", body: ["refresh_token": s.refreshToken])
        let (data, resp): (Data, HTTPURLResponse)
        do { (data, resp) = try await transport.send(req) } catch { throw classify(error) }
        switch resp.statusCode {
        case 200: return try session(from: data, fallbackEmail: s.email)
        case 400, 401, 403, 422: throw AppError.sessionExpired      // refresh token invalid/used/revoked
        default: throw AppError.server(resp.statusCode)
        }
    }

    /// Best effort: revokes this session server-side. Local sign-out never depends on it.
    func signOut(_ s: AuthSession) async {
        var r = URLRequest(url: URL(string: config.url.absoluteString + "/auth/v1/logout?scope=local")!)
        r.httpMethod = "POST"
        r.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try? await transport.send(r)
    }
}

/// Owns the session. Refresh tokens are single-use, so concurrent refreshes are collapsed into one.
actor SessionCoordinator {
    private let auth: AuthClient
    private let storage: SessionStorage
    private let skew: TimeInterval
    private let clock: () -> Date
    private(set) var session: AuthSession?
    private var refreshing: Task<AuthSession, Error>?
    private let log: (String) -> Void      // event names only, never tokens

    init(auth: AuthClient, storage: SessionStorage, skew: TimeInterval = 60, clock: @escaping () -> Date = Date.init, log: @escaping (String) -> Void = { _ in }) {
        self.auth = auth; self.storage = storage; self.skew = skew; self.clock = clock; self.log = log
        self.session = storage.load()
    }

    var isSignedIn: Bool { session != nil }
    var email: String? { session?.email }

    func signIn(email: String, password: String) async throws {
        let s = try await auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        storage.save(s); session = s
    }

    func signOut() async {
        let old = session
        session = nil; refreshing = nil; storage.clear()
        if let old { await auth.signOut(old) }
    }

    /// A token valid for at least `skew` more seconds, refreshing first if needed.
    func accessToken() async throws -> String {
        guard let s = session else { throw AppError.sessionExpired }
        if s.expiresAt.timeIntervalSince(clock()) > skew { return s.accessToken }
        return try await refresh().accessToken
    }

    /// Forces a refresh (used after the server answers 401).
    func forceRefresh() async throws -> String { try await refresh().accessToken }

    private func refresh() async throws -> AuthSession {
        if let t = refreshing { return try await t.value }
        guard let current = session else { throw AppError.sessionExpired }
        let task = Task { try await self.auth.refresh(current) }
        refreshing = task
        defer { refreshing = nil }
        do {
            let s = try await task.value
            storage.save(s); session = s
            log("token refreshed; new expiry in \(Int(s.expiresAt.timeIntervalSince(clock())))s")
            return s
        } catch AppError.sessionExpired {
            session = nil; storage.clear()          // refresh token is dead: require a fresh sign-in
            log("refresh token rejected; session cleared")
            throw AppError.sessionExpired
        } catch {
            log("refresh failed (\(classify(error))); session kept")
            throw error
        }                                           // offline/server errors keep the session for a later retry
    }

    /// Debug/test hook: keeps the expiry but breaks the token, so the server answers 401.
    func debugCorruptAccessToken() {
        guard var s = session else { return }
        s.accessToken = "corrupted-token"; session = s; storage.save(s)
    }

    /// Debug/test hook: makes the current access token look expired and invalid.
    func debugExpireAccessToken() {
        guard var s = session else { return }
        s.expiresAt = clock().addingTimeInterval(-10); s.accessToken = "expired-token"
        session = s; storage.save(s)
    }
}
