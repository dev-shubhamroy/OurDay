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
    /// Shared notification history (same rows the web app shows) and its unread count.
    @Published var centre: [NotificationRow] = []
    @Published var centreAvailable = true
    var onUnreadChange: ((Int) -> Void)?

    let transport: DebugTransport
    let scheduler = NotificationScheduler()
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
        await scheduler.clearAll()
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
            await scheduler.apply(snap)
            await syncCentre(data: data, userID: uid)
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
                await scheduler.apply(c)        // re-plan from what we know so expiry is still respected
                Log.info("showing cached data from \(c.fetchedAt) cached=true")
            } else { phase = .failed(e) }
        }
    }

    // MARK: Background sync (notifications): never touches the briefing baseline

    private var syncing = false

    /// Refreshes data and reconciles OS notifications. Runs on a timer, on wake, on timezone/day change, after habit answers.
    func backgroundSync(reason: String) async {
        guard let coordinator, let data, !syncing, loadTask == nil else { return }
        guard await coordinator.isSignedIn, let uid = await coordinator.session?.userID else { return }
        syncing = true; defer { syncing = false }
        do {
            let snap = try await data.fetchSnapshot(userID: uid, calendar: .autoupdatingCurrent, now: Date())
            cache = snap
            await scheduler.apply(snap)
            await syncCentre(data: data, userID: uid)
            Log.info("background sync ok (\(reason))")
        } catch AppError.sessionExpired {
            Log.info("background sync: session expired; pending notifications kept, sign-in required")
            phase = .signedOut(AppError.sessionExpired.userMessage); signedInEmail = nil
        } catch {
            Log.info("background sync failed (\(reason)): \(classify(error)); existing notifications stay scheduled")
            if let c = cache { await scheduler.apply(c) }
        }
    }

    func reapplyNotifications() async { if let c = cache { await scheduler.apply(c) } }

    // MARK: Notification centre + synced preferences

    /// Order: push local edits (or adopt the server's values), ask the database for anything newly due, read the
    /// shared history, and alert natively for fresh partner activity. Every step tolerates failure on its own.
    private func syncCentre(data: DataClient, userID: String) async {
        let tz = TimeZone.autoupdatingCurrent.identifier
        do {
            if PrefsStore.dirty {
                try await data.savePrefs(userID: userID, PrefsRow(PrefsStore.prefs, timezone: tz)); PrefsStore.dirty = false
                Log.info("preferences pushed to server")
            } else if let row = try await data.fetchPrefs(userID: userID) {
                if row.prefs != PrefsStore.prefs { PrefsStore.prefs = row.prefs; Log.info("preferences updated from server (another device)"); if let c = cache { await scheduler.apply(c) } }
                if row.timezone != tz { try await data.savePrefs(userID: userID, PrefsRow(row.prefs, timezone: tz)) }
            } else {
                try await data.savePrefs(userID: userID, PrefsRow(PrefsStore.prefs, timezone: tz)); Log.info("preferences created on server")
            }
            try await data.generateMyNotifications()
            let rows = try await data.fetchNotifications()
            centre = rows; centreAvailable = true
            onUnreadChange?(CentreRules.unread(rows))
            var seen = PrefsStore.seenAlerts
            let fresh = CentreRules.alerts(rows, seen: seen, now: Date(), prefs: PrefsStore.prefs)
            for r in fresh { await scheduler.postAlert(id: r.id, title: r.title, body: r.body); seen.insert(r.id) }
            if !fresh.isEmpty { PrefsStore.seenAlerts = seen; Log.info("partner alerts shown: \(fresh.count)") }
            Log.info("centre synced: items=\(rows.count) unread=\(CentreRules.unread(rows))")
        } catch AppError.backendUnavailable {
            if centreAvailable { Log.info("notification centre unavailable: backend not deployed") }
            centreAvailable = false
        } catch { Log.info("centre sync failed: \(classify(error)); local notifications unaffected") }
    }

    func markRead(_ ids: [String]) async {
        guard let data, !ids.isEmpty else { return }
        let before = centre
        centre = centre.map { r in ids.contains(r.id) && r.isUnread ? NotificationRow(id: r.id, kind: r.kind, title: r.title, body: r.body, task_id: r.task_id, habit_id: r.habit_id, actor_id: r.actor_id, occurred_at: r.occurred_at, read_at: ISO8601DateFormatter().string(from: Date())) : r }
        onUnreadChange?(CentreRules.unread(centre))
        do { try await data.markRead(ids: ids) } catch { centre = before; onUnreadChange?(CentreRules.unread(before)); Log.info("mark read failed: \(classify(error))") }
    }

    func markAllRead() async {
        guard let data, let uid = await coordinator?.session?.userID else { return }
        await markRead(centre.filter(\.isUnread).map(\.id))
        do { try await data.markAllRead(userID: uid) } catch { Log.info("mark all read failed: \(classify(error))") }
    }

    /// Local preference edit: apply now (works offline), sync when possible.
    func changePrefs(_ f: (inout NotificationPrefs) -> Void) async {
        var p = PrefsStore.prefs; f(&p); PrefsStore.prefs = p; PrefsStore.dirty = true
        Log.info("preferences: master=\(p.master) deadlines=\(p.deadlines) habits=\(p.habits) partner=\(p.partner) unlockBriefing=\(p.unlockBriefing)")
        await reapplyNotifications()
        await backgroundSync(reason: "preferences")
    }

    /// Yes / No from the 9:30 PM notification. Writes only the signed-in user's own log for that habit and day.
    func answerHabit(habitID: String, day: String, done: Bool) async {
        guard let coordinator, let data, let uid = await coordinator.session?.userID else { Log.info("habit answer ignored: not signed in"); return }
        let cal = Calendar.autoupdatingCurrent
        guard day == DayKey.key(Date(), cal) else { Log.info("habit answer ignored: day \(day) has passed (unanswered days count as missed)"); return }
        do {
            if cache?.workspaceID == nil { cache = try await data.fetchSnapshot(userID: uid, calendar: cal, now: Date()) }
            guard let ws = cache?.workspaceID else { throw AppError.noWorkspace }
            let current = try await data.currentHabitLog(habitID: habitID, userID: uid, day: day)
            if current == "done" && !done { Log.info("habit answer ignored: already completed (not downgraded)"); return }
            if current == (done ? "done" : "missed") { Log.info("habit answer ignored: already recorded"); return }
            try await data.writeHabitLog(habitID: habitID, userID: uid, workspaceID: ws, day: day, status: done ? "done" : "missed")
            Log.info("habit check-in saved: \(done ? "done" : "missed")")
            await markRead(CentreRules.answeredCheckIns(centre, habitID: habitID))
            await backgroundSync(reason: "habit answer")
        } catch {
            Log.info("habit answer failed: \(classify(error))")
            await scheduler.notifyFailure("Couldn’t save your check-in (\(classify(error).userMessage)) Open OurDay and check in there.")
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
