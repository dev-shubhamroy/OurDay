import Foundation

// MOCKED tests: scripted transport, fixture data. No real Supabase involved.

final class MockTransport: HTTPTransport {
    var handler: (URLRequest) throws -> (Int, String)
    private(set) var requests: [URLRequest] = []
    private let lock = NSLock()
    var delayNanos: UInt64 = 0
    init(_ h: @escaping (URLRequest) throws -> (Int, String)) { handler = h }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        record(request)
        if delayNanos > 0 { try? await Task.sleep(nanoseconds: delayNanos) }
        let (code, body) = try handler(request)
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!)
    }
    private func record(_ r: URLRequest) { lock.lock(); requests.append(r); lock.unlock() }
    func count(_ part: String) -> Int { requests.filter { $0.url!.absoluteString.contains(part) }.count }
}

let cfg = SupabaseConfig(url: URL(string: "https://example.supabase.co")!, publishableKey: "sb_publishable_TESTKEY")
func tokenJSON(access: String = "A1", refresh: String = "R1", expiresAt: Double = 4_000_000_000, user: String = "me") -> String {
    #"{"access_token":"\#(access)","refresh_token":"\#(refresh)","expires_in":3600,"expires_at":\#(expiresAt),"user":{"id":"\#(user)","email":"me@example.com"}}"#
}

func kolkata() -> Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Asia/Kolkata")!; return c }
func utc(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }

func runAuthTests() async {
    // sign-in success
    do {
        let t = MockTransport { _ in (200, tokenJSON()) }
        let s = try? await AuthClient(config: cfg, transport: t).signIn(email: "me@example.com", password: "pw")
        check(s?.userID == "me" && s?.accessToken == "A1", "signIn parses session")
        let r = t.requests[0]
        check(r.value(forHTTPHeaderField: "apikey") == cfg.publishableKey, "signIn sends publishable key")
        check(r.url!.absoluteString.hasSuffix("/auth/v1/token?grant_type=password"), "signIn endpoint")
        check(r.value(forHTTPHeaderField: "Authorization") == nil, "signIn sends no bearer")
    }
    // invalid credentials / offline / server
    do {
        let bad = MockTransport { _ in (400, #"{"error_code":"invalid_credentials","msg":"Invalid login credentials"}"#) }
        do { _ = try await AuthClient(config: cfg, transport: bad).signIn(email: "a", password: "b"); check(false, "should throw") } catch { check((error as? AppError) == .invalidCredentials, "invalid credentials mapped") }
        let off = MockTransport { _ in throw URLError(.notConnectedToInternet) }
        do { _ = try await AuthClient(config: cfg, transport: off).signIn(email: "a", password: "b"); check(false, "should throw") } catch { check((error as? AppError) == .offline, "offline mapped") }
        let srv = MockTransport { _ in (503, "") }
        do { _ = try await AuthClient(config: cfg, transport: srv).signIn(email: "a", password: "b"); check(false, "should throw") } catch { check((error as? AppError) == .server(503), "server error mapped") }
    }
    // coordinator: valid token, no network
    do {
        let st = MemorySessionStorage(); st.value = AuthSession(accessToken: "A1", refreshToken: "R1", expiresAt: Date().addingTimeInterval(3600), userID: "me", email: "e")
        let t = MockTransport { _ in (200, tokenJSON()) }
        let c = SessionCoordinator(auth: AuthClient(config: cfg, transport: t), storage: st)
        let tok = try? await c.accessToken()
        check(tok == "A1" && t.requests.isEmpty, "fresh token returned without refresh")
    }
    // near expiry → refresh once, saved
    do {
        let st = MemorySessionStorage(); st.value = AuthSession(accessToken: "OLD", refreshToken: "R1", expiresAt: Date().addingTimeInterval(20), userID: "me", email: "e")
        let t = MockTransport { _ in (200, tokenJSON(access: "NEW", refresh: "R2")) }
        let c = SessionCoordinator(auth: AuthClient(config: cfg, transport: t), storage: st)
        let tok = try? await c.accessToken()
        check(tok == "NEW" && st.value?.refreshToken == "R2", "expiring token refreshed and persisted")
    }
    // single-flight
    do {
        let st = MemorySessionStorage(); st.value = AuthSession(accessToken: "OLD", refreshToken: "R1", expiresAt: Date().addingTimeInterval(-5), userID: "me", email: "e")
        let t = MockTransport { _ in (200, tokenJSON(access: "NEW", refresh: "R2")) }; t.delayNanos = 100_000_000
        let c = SessionCoordinator(auth: AuthClient(config: cfg, transport: t), storage: st)
        let toks = await withTaskGroup(of: String?.self) { g -> [String?] in
            for _ in 0..<6 { g.addTask { try? await c.accessToken() } }
            var r: [String?] = []; for await x in g { r.append(x) }; return r
        }
        check(t.count("refresh_token") == 1, "6 concurrent callers cause exactly 1 refresh (got \(t.count("refresh_token")))")
        check(toks.allSatisfy { $0 == "NEW" }, "all callers get the new token")
    }
    // refresh rejected → cleared; offline → kept
    do {
        let st = MemorySessionStorage(); st.value = AuthSession(accessToken: "OLD", refreshToken: "R1", expiresAt: Date().addingTimeInterval(-5), userID: "me", email: "e")
        let rej = MockTransport { _ in (400, #"{"error_code":"refresh_token_not_found"}"#) }
        let c = SessionCoordinator(auth: AuthClient(config: cfg, transport: rej), storage: st)
        do { _ = try await c.accessToken(); check(false, "should throw") } catch { check((error as? AppError) == .sessionExpired, "rejected refresh → sessionExpired") }
        let si1 = await c.isSignedIn
        check(st.value == nil && !si1, "dead session cleared from storage")

        let st2 = MemorySessionStorage(); st2.value = AuthSession(accessToken: "OLD", refreshToken: "R1", expiresAt: Date().addingTimeInterval(-5), userID: "me", email: "e")
        let off = MockTransport { _ in throw URLError(.timedOut) }
        let c2 = SessionCoordinator(auth: AuthClient(config: cfg, transport: off), storage: st2)
        do { _ = try await c2.accessToken(); check(false, "should throw") } catch { check((error as? AppError) == .offline, "offline refresh → offline") }
        let si2 = await c2.isSignedIn
        check(st2.value != nil && si2, "session kept when refresh fails offline")
    }
    // sign-out
    do {
        let st = MemorySessionStorage()
        let t = MockTransport { r in r.url!.absoluteString.contains("logout") ? (204, "") : (200, tokenJSON()) }
        let c = SessionCoordinator(auth: AuthClient(config: cfg, transport: t), storage: st)
        try? await c.signIn(email: " me@example.com ", password: "pw")
        check(st.value != nil, "signIn stores session")
        await c.signOut()
        let si3 = await c.isSignedIn
        check(st.value == nil && !si3 && t.count("logout") == 1, "signOut clears storage and revokes")
    }
}

func runDataTests() async {
    func coordinator(_ t: MockTransport, expires: TimeInterval = 3600) -> SessionCoordinator {
        let st = MemorySessionStorage(); st.value = AuthSession(accessToken: "A1", refreshToken: "R1", expiresAt: Date().addingTimeInterval(expires), userID: "me", email: "e")
        return SessionCoordinator(auth: AuthClient(config: cfg, transport: t), storage: st)
    }
    let members = #"[{"user_id":"me","role":"owner","joined_at":"2026-11-01T00:00:00+00:00"},{"user_id":"pa","role":"partner","joined_at":"2026-11-02T00:00:00+00:00"}]"#
    let profiles = #"[{"id":"me","name":"Shubham Roy"},{"id":"pa","name":"Priya Sen"}]"#
    let task = #"{"id":"t1","kind":"deadline","title":"Report","notes":null,"created_by":"me","notify_second_user":false,"task_date":"2026-11-08","planned_time":null,"due_at":"2026-11-08T12:30:00.123456+00:00","status":"open","completed_at":null,"completed_by":null,"created_at":"2026-11-01T00:00:00+00:00"}"#
    func router(tasks: String = "[\(task)]") -> (URLRequest) -> (Int, String) {
        return { r in
            let u = r.url!.absoluteString
            if u.contains("/workspace_members") { return (200, members) }
            if u.contains("/profiles") { return (200, profiles) }
            if u.contains("/tasks") { return (200, tasks) }
            return (200, "[]")
        }
    }
    // happy path + headers
    do {
        let t = MockTransport { r in router()(r) }
        let c = DataClient(config: cfg, transport: t, coordinator: coordinator(t))
        let snap = try? await c.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date())
        check(snap?.members.count == 2 && snap?.tasks.count == 1, "snapshot built")
        check(snap?.name(of: "pa") == "Priya", "partner name from profile")
        check(snap?.tasks.first?.due != nil, "microsecond timestamp parsed")
        check(t.requests.allSatisfy { $0.value(forHTTPHeaderField: "apikey") == cfg.publishableKey && $0.value(forHTTPHeaderField: "Authorization") == "Bearer A1" }, "every request: publishable key + user JWT")
        check(!t.requests.contains { ($0.value(forHTTPHeaderField: "apikey") ?? "").contains("service") }, "no service key header")
    }
    // 401 → refresh → retry
    do {
        var tasksCalls = 0
        let t = MockTransport { r in
            let u = r.url!.absoluteString
            if u.contains("grant_type=refresh_token") { return (200, tokenJSON(access: "A2", refresh: "R2")) }
            if r.value(forHTTPHeaderField: "Authorization") == "Bearer A1" { return (401, #"{"message":"JWT expired"}"#) }
            if u.contains("/tasks") { tasksCalls += 1 }
            return router()(r)
        }
        let c = DataClient(config: cfg, transport: t, coordinator: coordinator(t))
        let snap = try? await c.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date())
        check(snap != nil, "401 → refresh → retry succeeds")
        check(t.count("grant_type=refresh_token") == 1, "refreshed exactly once despite parallel requests (got \(t.count("grant_type=refresh_token")))")
    }
    // persistent 401 → sessionExpired
    do {
        let t = MockTransport { r in r.url!.absoluteString.contains("grant_type") ? (200, tokenJSON(access: "A2")) : (401, "{}") }
        let c = DataClient(config: cfg, transport: t, coordinator: coordinator(t))
        do { _ = try await c.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date()); check(false, "should throw") } catch { check((error as? AppError) == .sessionExpired, "401 after refresh → sessionExpired") }
    }
    // pagination
    do {
        var pages = 0
        let t = MockTransport { r in
            if r.url!.absoluteString.contains("/tasks") {
                pages += 1
                let first = !r.url!.absoluteString.contains("offset=3")
                func mk(_ id: String) -> String { task.replacingOccurrences(of: "t1", with: id) }
                return (200, first ? "[\(mk("a")),\(mk("b")),\(mk("c"))]" : "[\(mk("d"))]")
            }
            return router()(r)
        }
        var c = DataClient(config: cfg, transport: t, coordinator: coordinator(t)); c.pageSize = 3
        let snap = try? await c.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date())
        check(snap?.tasks.count == 4 && pages == 2, "pagination reads all pages")
    }
    // no workspace / server error / offline
    do {
        let t = MockTransport { _ in (200, "[]") }
        let c = DataClient(config: cfg, transport: t, coordinator: coordinator(t))
        do { _ = try await c.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date()); check(false, "should throw") } catch { check((error as? AppError) == .noWorkspace, "no workspace → noWorkspace") }
        let t2 = MockTransport { _ in (500, "") }
        let c2 = DataClient(config: cfg, transport: t2, coordinator: coordinator(t2))
        do { _ = try await c2.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date()); check(false, "should throw") } catch { check((error as? AppError) == .server(500), "500 → server error") }
        let t3 = MockTransport { _ in throw URLError(.notConnectedToInternet) }
        let c3 = DataClient(config: cfg, transport: t3, coordinator: coordinator(t3))
        do { _ = try await c3.fetchSnapshot(userID: "me", calendar: kolkata(), now: Date()); check(false, "should throw") } catch { check((error as? AppError) == .offline, "network down → offline") }
    }
}

// MARK: Briefing engine fixtures

let ist = kolkata()
let now0 = utc("2026-11-08T10:00:00Z")   // Sun 8 Nov 2026, 15:30 IST
func dl(_ id: String, _ title: String, due: String, by: String = "me", status: TaskStatus = .open, doneBy: String? = nil, doneAt: String? = nil) -> WTask {
    let d = utc(due)
    return WTask(id: id, kind: .deadline, title: title, createdBy: by, date: DayKey.key(d, ist), time: nil, due: d, status: status, completedAt: doneAt.map(utc), completedBy: doneBy)
}
func daily(_ id: String, _ title: String, day: String, time: String? = nil, by: String = "me", done: Bool = false, doneBy: String? = nil) -> WTask {
    WTask(id: id, kind: .daily, title: title, createdBy: by, date: day, time: time, due: nil, status: done ? .completed : .open, completedAt: done ? now0 : nil, completedBy: done ? (doneBy ?? by) : nil)
}
func snap(tasks: [WTask] = [], habits: [WHabit] = [], partner: Bool = true) -> DataSnapshot {
    var m = [Member(id: "me", name: "Shubham Roy", role: "owner")]
    if partner { m.append(Member(id: "pa", name: "Priya Sen", role: "partner")) }
    return DataSnapshot(meID: "me", members: m, tasks: tasks, habits: habits, fetchedAt: now0)
}

func runEngineTests() {
    // timezone: 2026-11-08T18:40Z is 00:10 on 9 Nov in Kolkata → tomorrow
    let row = TaskRow(id: "x", kind: "deadline", title: "T", notes: nil, created_by: "me", notify_second_user: false, task_date: "2026-11-08", planned_time: nil, due_at: "2026-11-08T18:40:00+00:00", status: "open", completed_at: nil, completed_by: nil, created_at: "2026-11-01T00:00:00+00:00")
    check(Mapper.task(row, ist)?.date == "2026-11-09", "deadline day comes from the instant in the device timezone")
    var utcCal = Calendar(identifier: .gregorian); utcCal.timeZone = TimeZone(identifier: "UTC")!
    check(Mapper.task(row, utcCal)?.date == "2026-11-08", "same instant is Nov 8 in UTC (timezone derived from device)")

    // grouping, exclusions
    let tasks = [
        dl("d1", "Pay rent", due: "2026-11-08T12:00:00Z"),                                   // 17:30 IST today
        dl("d2", "Expired", due: "2026-11-08T09:00:00Z"),                                    // already past
        dl("d3", "Done today", due: "2026-11-08T13:00:00Z", status: .completed, doneBy: "me", doneAt: "2026-11-08T09:30:00Z"),
        dl("d4", "Tomorrow thing", due: "2026-11-09T05:00:00Z", by: "pa"),                   // 10:30 IST tomorrow
        dl("d5", "Later 1", due: "2026-11-12T05:00:00Z"), dl("d6", "Later 2", due: "2026-11-13T05:00:00Z"),
        dl("d7", "Later 3", due: "2026-11-14T05:00:00Z"), dl("d8", "Later 4", due: "2026-11-15T05:00:00Z"),
    ]
    let b = BriefingEngine.build(snapshot: snap(tasks: tasks), now: now0, cal: ist, previous: nil)
    check(b.kind == .full, "no previous state → full")
    check(b.deadlinesToday.map(\.id) == ["d1"], "today's deadlines exclude expired and completed")
    check(b.completedDeadlinesToday == 1, "completed deadline counted, not listed")
    check(b.deadlinesTomorrow.map(\.id) == ["d4"] && b.deadlinesTomorrow[0].ownerName == "Priya", "tomorrow's deadlines with partner owner")
    check(b.deadlinesUpcoming.map(\.id) == ["d5", "d6", "d7"] && b.upcomingMore == 1, "upcoming limited to 3 with remainder count")
    check(b.deadlinesToday[0].urgency == .critical && b.deadlinesToday[0].remaining == 7200, "2h left is critical (≤3h)")
    check(BriefingEngine.remainingText(2 * 3600 + 14 * 60) == "2h 14m left" && BriefingEngine.remainingText(35 * 60) == "35m left" && BriefingEngine.remainingText(3 * 86400 + 4 * 3600) == "3d 4h left", "remaining wording matches web")
    check(b.nextUp?.id == "d1", "next up is the soonest active deadline")
    check(b.summary[0] == "You have one deadline today." || b.summary[0].hasPrefix("You have one deadline today."), "summary wording deterministic")

    // daily tasks
    let dts = [daily("a", "Gym", day: "2026-11-08", time: "07:00", done: true), daily("b", "Call bank", day: "2026-11-08", time: "16:00"),
               daily("c", "Groceries", day: "2026-11-09", by: "pa"), daily("z", "Next week", day: "2026-11-20")]
    let b2 = BriefingEngine.build(snapshot: snap(tasks: dts), now: now0, cal: ist, previous: nil)
    check(b2.tasksToday.map(\.id) == ["b", "a"] && b2.tasksToday[0].timeText == "4:00 PM", "today's tasks: incomplete first, 12-hour times")
    check(b2.tasksTomorrow.map(\.id) == ["c"] && b2.tasksTomorrow[0].ownerName == "Priya", "tomorrow's tasks only")

    // habits: weekday schedule (Sunday = 0), streaks, shared partner status
    let sunday = 0
    let hs = [
        WHabit(id: "h1", title: "Read", participants: ["me"], days: nil, paused: false, startDate: "2026-11-01", log: ["me": ["2026-11-07": LogEntry(status: .done, at: now0), "2026-11-06": LogEntry(status: .done, at: now0), "2026-11-05": LogEntry(status: .done, at: now0)]]),
        WHabit(id: "h2", title: "Walk", participants: ["me", "pa"], days: nil, paused: false, startDate: "2026-11-01", log: ["pa": ["2026-11-08": LogEntry(status: .done, at: utc("2026-11-08T05:00:00Z"))]]),
        WHabit(id: "h3", title: "Mondays only", participants: ["me"], days: [1], paused: false, startDate: "2026-11-01", log: [:]),
        WHabit(id: "h4", title: "Sundays", participants: ["me"], days: [sunday], paused: false, startDate: "2026-11-01", log: [:]),
        WHabit(id: "h5", title: "Paused", participants: ["me"], days: nil, paused: true, startDate: "2026-11-01", log: [:]),
        WHabit(id: "h6", title: "Partner personal", participants: ["pa"], days: nil, paused: false, startDate: "2026-11-01", log: [:]),
    ]
    let b3 = BriefingEngine.build(snapshot: snap(habits: hs), now: now0, cal: ist, previous: nil)
    check(Set(b3.habits.map(\.id)) == ["h1", "h2", "h4"], "habits: scheduled today, mine, not paused (got \(b3.habits.map(\.id)))")
    check(b3.habits.first { $0.id == "h1" }?.streak == 3 && b3.habits.first { $0.id == "h1" }?.done == false, "streak 3 through yesterday, today pending")
    check(b3.habits.first { $0.id == "h2" }?.partnerDone == true && b3.habits.first { $0.id == "h2" }?.partnerName == "Priya", "shared habit shows partner status")
    check(b3.together.contains { $0.contains("Priya checked in “Walk”") }, "together lists partner check-in")
    // a miss breaks the streak; unscheduled day does not
    let hm = WHabit(id: "m", title: "M", participants: ["me"], days: [0, 2], paused: false, startDate: "2026-11-01",
                    log: ["me": ["2026-11-08": LogEntry(status: .done, at: now0), "2026-11-03": LogEntry(status: .done, at: now0)]])
    check(HabitRules.streak(hm, user: "me", today: "2026-11-08", ist) == 2, "Sun done, Tue(3rd) done, Sat/Mon off; Tue(3rd).. then missed Sun(1st)? streak counts 8th and 3rd")
    let hbreak = WHabit(id: "b", title: "B", participants: ["me"], days: nil, paused: false, startDate: "2026-11-01", log: ["me": ["2026-11-08": LogEntry(status: .done, at: now0), "2026-11-06": LogEntry(status: .done, at: now0)]])
    check(HabitRules.streak(hbreak, user: "me", today: "2026-11-08", ist) == 1, "missed day (Nov 7) breaks streak")

    // update briefing: changes since previous
    let before = snap(tasks: [dl("d1", "Pay rent", due: "2026-11-08T20:00:00Z"), dl("d9", "Send form", due: "2026-11-08T12:30:00Z", by: "pa"), daily("t1", "Call bank", day: "2026-11-08")], habits: [hs[1]])
    let prevState = BriefingEngine.stateAfter(before, now: utc("2026-11-08T05:00:00Z"), cal: ist)
    let after = snap(tasks: [
        dl("d1", "Pay rent", due: "2026-11-08T20:00:00Z"),
        dl("d9", "Send form", due: "2026-11-08T12:30:00Z", by: "pa", status: .completed, doneBy: "pa", doneAt: "2026-11-08T09:50:00Z"),
        dl("d10", "Brand new", due: "2026-11-09T05:00:00Z", by: "pa"),
        daily("t1", "Call bank", day: "2026-11-08", done: true, doneBy: "pa"),
        dl("d11", "Soon", due: "2026-11-08T11:30:00Z")], habits: [hs[1]])
    let u = BriefingEngine.build(snapshot: after, now: now0, cal: ist, previous: prevState)
    let texts = u.changes.map(\.text)
    check(u.kind == .update, "same-day previous state → update")
    check(texts.contains("Priya completed deadline “Send form”") && u.changes.first { $0.text.contains("Send form") }?.byPartner == true, "partner completion reported as partner change")
    check(texts.contains { $0.hasPrefix("New deadline “Brand new” — Tomorrow") }, "new deadline reported")
    check(texts.contains("Priya completed “Call bank”"), "partner completed a daily task")
    check(texts.contains { $0.hasPrefix("New deadline “Soon”") }, "new deadline today reported")
    check(!texts.contains { $0.contains("Pay rent") }, "unchanged item not reported")
    let unchanged = BriefingEngine.build(snapshot: before, now: utc("2026-11-08T05:00:00Z"), cal: ist, previous: prevState)
    check(unchanged.kind == .update && unchanged.changes.isEmpty, "nothing changed → empty change list")
    // urgency escalation
    let esc = BriefingEngine.build(snapshot: before, now: utc("2026-11-08T17:30:00Z"), cal: ist, previous: prevState)
    check(esc.changes.contains { $0.text.hasPrefix("“Pay rent” is now critical") }, "deadline turning critical reported (\(esc.changes.map(\.text)))")
    check(esc.changes.contains { $0.text == "Deadline “Send form” has passed" }, "deadline expiring reported")
    // new day / other user → full
    check(BriefingEngine.build(snapshot: before, now: utc("2026-11-09T05:00:00Z"), cal: ist, previous: prevState).kind == .full, "next local day → full")
    var other = prevState; other.userID = "someone-else"
    check(BriefingEngine.build(snapshot: before, now: now0, cal: ist, previous: other).kind == .full, "state of a different user is ignored")

    // empty data
    let e = BriefingEngine.build(snapshot: snap(partner: false), now: now0, cal: ist, previous: nil)
    check(e.deadlinesToday.isEmpty && e.tasksToday.isEmpty && e.habits.isEmpty && e.together.isEmpty && e.nextUp == nil, "empty data handled")
    check(e.summary.first == "No deadlines today, so you can focus on the day itself." && e.summary.contains("Your daily task list is clear."), "empty summary wording")
    check(e.partnerName == nil, "no partner → no partner section")

    // persistence: ids/status only, per-user
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ourday-\(UUID().uuidString)")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let store = FileStateStore(url: dir.appendingPathComponent("s.json"))
    store.save(prevState)
    check(store.load(userID: "me") == prevState, "state round-trips through disk (restart persistence)")
    check(store.load(userID: "other") == nil, "state not returned for another user")
    let raw = (try? String(contentsOf: store.url)) ?? ""
    check(!raw.contains("Pay rent") && !raw.contains("Send form") && !raw.contains("Call bank"), "persisted state contains no titles")
}
