import Foundation

protocol HTTPTransport {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionTransport: HTTPTransport {
    let session: URLSession
    init() {
        let c = URLSessionConfiguration.ephemeral     // no cookies, no disk cache of authenticated responses
        c.timeoutIntervalForRequest = 15
        c.waitsForConnectivity = false
        session = URLSession(configuration: c)
    }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (d, r) = try await session.data(for: request)
        guard let h = r as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (d, h)
    }
}

struct SupabaseConfig: Equatable {
    var url: URL
    /// The PUBLISHABLE key only. The app never contains a service-role or secret key.
    var publishableKey: String
}

enum AppError: Error, Equatable {
    case invalidCredentials
    case sessionExpired          // refresh token rejected: user must sign in again
    case unauthorized            // access token rejected (retry after refresh)
    case offline                 // no network / timeout / DNS
    case server(Int)             // 5xx / 429 / unexpected status
    case noWorkspace
    case notConfigured
    case decoding

    var userMessage: String {
        switch self {
        case .invalidCredentials: return "That email or password isn’t right."
        case .sessionExpired: return "Your session expired. Please sign in again."
        case .unauthorized: return "Your session isn’t valid. Please sign in again."
        case .offline: return "You appear to be offline."
        case .server(let c): return "OurDay’s server had a problem (\(c)). Try again shortly."
        case .noWorkspace: return "You haven’t created or joined a workspace yet. Open the dashboard to set one up."
        case .notConfigured: return "This build has no Supabase configuration."
        case .decoding: return "OurDay returned data this version can’t read."
        }
    }
}

func classify(_ error: Error) -> AppError {
    if let e = error as? AppError { return e }
    if error is URLError || (error as NSError).domain == NSURLErrorDomain { return .offline }
    return .offline
}
