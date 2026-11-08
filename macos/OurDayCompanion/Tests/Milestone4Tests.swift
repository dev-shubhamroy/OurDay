import Foundation

func runCentreTests() async {
    // prefs: old saved JSON without newer keys still decodes with defaults
    let old = try? JSONDecoder().decode(NotificationPrefs.self, from: Data(#"{"master":false,"deadlines":true,"habits":true,"partner":true}"#.utf8))
    check(old?.master == false && old?.unlockBriefing == true, "older saved preferences decode with defaults")
    let row = PrefsRow(NotificationPrefs(master: true, deadlines: false, habits: true, partner: false, unlockBriefing: false), timezone: "Asia/Kolkata")
    check(row.prefs == NotificationPrefs(master: true, deadlines: false, habits: true, partner: false, unlockBriefing: false), "prefs ⇄ row round trip")
    let json = String(data: (try? JSONEncoder().encode(row)) ?? Data(), encoding: .utf8) ?? ""
    check(json.contains("\"unlock_briefing\":false") && json.contains("Asia\\/Kolkata"), "row uses the shared snake_case column names")

    func n(_ id: String, _ kind: String, ago: TimeInterval, read: Bool = false, habit: String? = nil) -> NotificationRow {
        NotificationRow(id: id, kind: kind, title: "t", body: "b", task_id: nil, habit_id: habit, actor_id: nil,
                        occurred_at: ISO8601DateFormatter().string(from: now0.addingTimeInterval(-ago)), read_at: read ? "2026-11-08T10:00:00Z" : nil)
    }
    let rows = [n("p1", "partner", ago: 60), n("p2", "partner", ago: 3 * 3600), n("p3", "partner", ago: 30, read: true), n("p4", "partner", ago: 90), n("d1", "deadline", ago: 30)]
    let a = CentreRules.alerts(rows, seen: ["p4"], now: now0, prefs: NotificationPrefs())
    check(a.map(\.id) == ["p1"], "alerts: unread, unseen, recent partner rows only (got \(a.map(\.id)))")
    check(CentreRules.alerts(rows, seen: [], now: now0, prefs: NotificationPrefs(partner: false)).isEmpty, "partner toggle off → no alerts")
    check(CentreRules.alerts(rows, seen: [], now: now0, prefs: NotificationPrefs(master: false)).isEmpty, "master off → no alerts")
    check(CentreRules.unread(rows) == 4, "unread count")
    check(CentreRules.answeredCheckIns([n("h1", "habit", ago: 10, habit: "H"), n("h2", "habit", ago: 10, read: true, habit: "H"), n("h3", "habit", ago: 10, habit: "X")], habitID: "H") == ["h1"], "answering a check-in marks only that habit's unread row")
    check(NotificationRow(id: "x", kind: "habit", title: "", body: "", task_id: nil, habit_id: "H", actor_id: nil, occurred_at: "2026-11-08T10:00:00Z", read_at: nil).dashboardPath == "/habits", "habit row opens /habits")
    check(n("d", "deadline", ago: 1).dashboardPath == "/deadlines" && n("p", "partner", ago: 1).dashboardPath == "/home", "deadline → /deadlines, partner → /home")

    // client calls (mocked): endpoints, auth headers, 404 → backendUnavailable
    let st = MemorySessionStorage(); st.value = AuthSession(accessToken: "A1", refreshToken: "R1", expiresAt: Date().addingTimeInterval(3600), userID: "me", email: "e")
    let t = MockTransport { r in
        let u = r.url!.absoluteString
        if u.contains("rpc/generate_my_notifications") { return (200, "3") }
        if u.contains("/notifications?select") { return (200, #"[{"id":"1","kind":"partner","title":"A completed a task","body":"x","task_id":null,"habit_id":null,"actor_id":"pa","occurred_at":"2026-11-08T10:00:00+00:00","read_at":null}]"#) }
        if u.contains("notification_preferences?select") { return (200, #"[{"master":true,"deadlines":true,"habits":false,"partner":true,"unlock_briefing":true,"timezone":"UTC"}]"#) }
        return (204, "")
    }
    let c = DataClient(config: cfg, transport: t, coordinator: SessionCoordinator(auth: AuthClient(config: cfg, transport: t), storage: st))
    try? await c.generateMyNotifications()
    let list = try? await c.fetchNotifications()
    check(list?.count == 1 && list?[0].isUnread == true, "notifications decode")
    let pr = try? await c.fetchPrefs(userID: "me")
    check(pr?.habits == false, "preferences row decodes")
    try? await c.markRead(ids: ["1", "2"])
    try? await c.markAllRead(userID: "me")
    try? await c.savePrefs(userID: "me", PrefsRow(NotificationPrefs(), timezone: "UTC"))
    check(t.requests.contains { $0.httpMethod == "PATCH" && $0.url!.absoluteString.contains("id=in.(1,2)&read_at=is.null") }, "mark read patches only the given unread ids")
    check(t.requests.contains { $0.httpMethod == "PATCH" && $0.url!.absoluteString.contains("user_id=eq.me&read_at=is.null") }, "mark all read is scoped to my user id")
    check(t.requests.contains { $0.httpMethod == "POST" && $0.url!.absoluteString.contains("on_conflict=user_id") && $0.value(forHTTPHeaderField: "Prefer")?.contains("merge-duplicates") == true }, "preferences upsert on user_id")
    check(t.requests.allSatisfy { $0.value(forHTTPHeaderField: "apikey") == cfg.publishableKey }, "only the publishable key is sent")
    let missing = MockTransport { _ in (404, #"{"code":"PGRST202"}"#) }
    let c2 = DataClient(config: cfg, transport: missing, coordinator: SessionCoordinator(auth: AuthClient(config: cfg, transport: missing), storage: st))
    do { try await c2.generateMyNotifications(); check(false, "should throw") } catch { check((error as? AppError) == .backendUnavailable, "404 → backendUnavailable (migration not applied)") }
    // habit log write: own user, merge on conflict, no duplicates
    let w = MockTransport { _ in (201, "") }
    let c3 = DataClient(config: cfg, transport: w, coordinator: SessionCoordinator(auth: AuthClient(config: cfg, transport: w), storage: st))
    try? await c3.writeHabitLog(habitID: "H", userID: "me", workspaceID: "W", day: "2026-11-08", status: "done")
    let req = w.requests[0]
    let body = String(data: req.httpBody ?? Data(), encoding: .utf8) ?? ""
    check(req.url!.absoluteString.hasSuffix("habit_logs?on_conflict=habit_id,user_id,day") && req.value(forHTTPHeaderField: "Prefer")!.contains("merge-duplicates"), "habit answer upserts on (habit,user,day) → no duplicate logs")
    check(body.contains("\"user_id\":\"me\"") && body.contains("\"status\":\"done\""), "habit answer writes only the signed-in user's own row")
}
