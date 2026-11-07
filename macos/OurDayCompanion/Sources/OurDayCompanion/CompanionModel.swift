import Foundation
import SwiftUI

@MainActor
final class CompanionModel: ObservableObject {
    enum Phase: Equatable {
        case signedOut(String?)        // optional explanation, e.g. session expired
        case signingIn
        case loading
        case ready
        case failed(AppError)
    }

    @Published var phase: Phase = .loading
    @Published var briefing: Briefing?
    /// Non-nil when the shown data comes from memory because the server could not be reached.
    @Published var cachedSince: Date?
    @Published var signInError: String?
    @Published var signedInEmail: String?

    let transport: DebugTransport
    private let coordinator: SessionCoordinator?
    private let data: DataClient?
    private let store: BriefingStateStore
    private var cache: DataSnapshot?        // memory only; never written to disk
    private var loadTask: Task<Void, Never>?
    private var userID: String?
    /// The state as of the previous briefing, fixed for one briefing "session" so Refresh never changes full/update or the change list.
    private var baseline: BriefingState?

    init() {
        transport = DebugTransport(URLSessionTransport())
        store = FileStateStore.standard()
        if let cfg = AppConfig.load() {
            let c = SessionCoordinator(auth: AuthClient(config: cfg, transport: transport), storage: KeychainSessionStorage(), log: { Log.info($0) })
            coordinator = c
            data = DataClient(config: cfg, transport: transport, coordinator: c)
        } else { coordinator = nil; data = nil; phase = .failed(.notConfigured) }
    }

    var isSignedIn: Bool { if case .signedOut = phase { return false }; if case .signingIn = phase { return false }; return signedInEmail != nil }

    /// Called once at launch: restores a saved session (refreshing it if needed).
    func restore() async {
        guard let coordinator else { return }
        guard await coordinator.isSignedIn else { phase = .signedOut(nil); Log.info("no saved session; sign-in required"); return }
        do {
            _ = try await coordinator.accessToken()
            signedInEmail = await coordinator.email
            userID = await coordinator.session?.userID
            phase = .loading
            Log.info("session restored from Keychain")
        } catch AppError.sessionExpired {
            phase = .signedOut(AppError.sessionExpired.userMessage); Log.info("saved session expired; sign-in required")
        } catch {
            // Offline etc.: keep the session, data loads when the network returns.
            signedInEmail = await coordinator.email; userID = await coordinator.session?.userID
            phase = .loading; Log.info("session kept; refresh deferred (\(classify(error)))")
        }
    }

    func signIn(email: String, password: String) async {
        guard let coordinator else { return }
        signInError = nil; phase = .signingIn
        do {
            try await coordinator.signIn(email: email, password: password)
            signedInEmail = await coordinator.email; userID = await coordinator.session?.userID
            cache = nil; briefing = nil; cachedSince = nil; baseline = nil
            phase = .loading
            Log.info("sign-in succeeded")
            await loadBriefing()
        } catch {
            let e = classify(error)
            signInError = e.userMessage
            phase = signedInEmail != nil ? (briefing != nil ? .ready : .loading) : .signedOut(nil)   // a failed attempt never drops an existing session
            Log.info("sign-in failed: \(e)")
        }
    }

    func signOut() async {
        await coordinator?.signOut()
        store.clear(); cache = nil; briefing = nil; cachedSince = nil; signedInEmail = nil; userID = nil; baseline = nil
        phase = .signedOut(nil)
        Log.info("signed out; local session and briefing state removed")
    }

    /// Fetches fresh data and builds the briefing. Concurrent calls (e.g. several unlocks) share one load.
    /// `newSession` = a new unlock/open: compare against the last saved briefing. Refresh keeps the same baseline.
    func loadBriefing(newSession: Bool = true) async {
        if let t = loadTask { await t.value; return }
        let t = Task { await self.performLoad(newSession: newSession) }
        loadTask = t
        await t.value
        loadTask = nil
    }

    private func performLoad(newSession: Bool) async {
        guard let coordinator, let data else { return }
        guard await coordinator.isSignedIn, let uid = await coordinator.session?.userID else { phase = .signedOut(nil); return }
        if briefing == nil { phase = .loading }
        let cal = Calendar.autoupdatingCurrent
        let now = Date()
        do {
            let snap = try await data.fetchSnapshot(userID: uid, calendar: cal, now: now)
            cache = snap; cachedSince = nil
            if newSession || baseline?.userID != uid { baseline = store.load(userID: uid) }
            let previous = baseline
            let b = BriefingEngine.build(snapshot: snap, now: now, cal: cal, previous: previous)
            briefing = b; phase = .ready
            store.save(BriefingEngine.stateAfter(snap, now: now, cal: cal))
            Log.info("briefing built kind=\(b.kind) tz=\(cal.timeZone.identifier) deadlinesToday=\(b.deadlinesToday.count) deadlinesTomorrow=\(b.deadlinesTomorrow.count) upcoming=\(b.deadlinesUpcoming.count)+\(b.upcomingMore) tasksToday=\(b.tasksToday.count) tasksTomorrow=\(b.tasksTomorrow.count) habits=\(b.habits.count) together=\(b.together.count) changes=\(b.changes.count) partner=\(b.partnerName != nil) tasksInDb=\(snap.tasks.count) habitsInDb=\(snap.habits.count) cached=false")
        } catch AppError.sessionExpired {
            await coordinator.signOut(); store.clear(); briefing = nil; cache = nil; signedInEmail = nil
            phase = .signedOut(AppError.sessionExpired.userMessage); Log.info("session expired during load; signed out")
        } catch {
            let e = classify(error)
            Log.info("load failed: \(e)")
            if let c = cache {
                // Show what we last knew, rebuilt against the current clock, clearly marked as cached. Baseline is NOT advanced.
                briefing = BriefingEngine.build(snapshot: c, now: now, cal: cal, previous: baseline)
                cachedSince = c.fetchedAt; phase = .ready
                Log.info("showing cached data from \(c.fetchedAt) cached=true")
            } else { phase = .failed(e) }
        }
    }

    // MARK: Debug hooks
    func debugExpireToken() async { await coordinator?.debugExpireAccessToken() }
    func debugCorruptToken() async { await coordinator?.debugCorruptAccessToken() }
}

enum AppConfig {
    /// URL and PUBLISHABLE key are injected into Info.plist at build time from frontend/.env.local (git-ignored).
    static func load() -> SupabaseConfig? {
        let info = Bundle.main.infoDictionary
        guard let u = info?["OurDaySupabaseURL"] as? String, let url = URL(string: u), !u.isEmpty,
              let k = info?["OurDaySupabaseKey"] as? String, !k.isEmpty else { return nil }
        return SupabaseConfig(url: url, publishableKey: k)
    }
}
