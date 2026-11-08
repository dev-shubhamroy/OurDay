import Foundation

func dueIn(_ id: String, _ seconds: TimeInterval, by: String = "me", notify: Bool = false, status: TaskStatus = .open) -> WTask {
    let d = now0.addingTimeInterval(seconds)
    var t = WTask(id: id, kind: .deadline, title: "Task \(id)", createdBy: by, date: DayKey.key(d, ist), time: nil, due: d, status: status, completedAt: nil, completedBy: nil)
    t.notifyOther = notify
    return t
}
func offsets(_ plan: [PlannedNotification], _ id: String, due: TimeInterval) -> [Int] {
    plan.filter { $0.id.contains(".\(id).") }.map { Int(now0.addingTimeInterval(due).timeIntervalSince($0.fireDate)) }.sorted(by: >)
}

func runNotificationTests() {
    let prefs = NotificationPrefs()
    func plan(_ s: DataSnapshot, now: Date = now0, p: NotificationPrefs = prefs) -> [PlannedNotification] { NotificationPlanner.plan(s, now: now, ist, prefs: p) }

    // exact intervals
    let allTen = [86400, 43200, 21600, 10800, 7200, 3600, 1800, 900, 300, 0]
    check(offsets(plan(snap(tasks: [dueIn("a", 3 * 86400)])), "a", due: 3 * 86400) == allTen, "far deadline → exactly the 10 required reminders")
    // past intervals skipped
    check(offsets(plan(snap(tasks: [dueIn("a", 10 * 3600)])), "a", due: 10 * 3600) == [21600, 10800, 7200, 3600, 1800, 900, 300, 0], "10h away: 24h and 12h skipped")
    check(offsets(plan(snap(tasks: [dueIn("a", 4 * 60)])), "a", due: 4 * 60) == [0], "4 min away: only the exact deadline")
    check(plan(snap(tasks: [dueIn("a", 1)])).isEmpty, "due within the lead margin: nothing")
    // exact fire dates
    let p1 = plan(snap(tasks: [dueIn("a", 7 * 3600)]))
    check(p1.contains { $0.fireDate == now0.addingTimeInterval(7 * 3600 - 6 * 3600) && $0.title == "Due in 6 hours" }, "6h reminder fires at due-6h")
    check(p1.contains { $0.title == "Deadline now" && $0.fireDate == now0.addingTimeInterval(7 * 3600) }, "exact-deadline notification at the due instant")
    // never completed / expired / not mine
    check(plan(snap(tasks: [dueIn("c", 5 * 3600, status: .completed), dueIn("e", -3600)])).isEmpty, "completed and expired deadlines never notify")
    check(plan(snap(tasks: [dueIn("p", 5 * 3600, by: "pa")])).isEmpty, "partner's deadline without Notify-second-user: no reminders")
    let shared = plan(snap(tasks: [dueIn("p", 5 * 3600, by: "pa", notify: true)]))
    check(!shared.isEmpty && shared[0].body.contains("Priya’s"), "partner's deadline with Notify-second-user: reminders, labelled with owner")
    check(!plan(snap(tasks: [dueIn("m", 5 * 3600, by: "me", notify: false)])).isEmpty, "my own deadline always notifies me")
    check(plan(snap(tasks: [WTask(id: "d", kind: .daily, title: "x", createdBy: "me", date: "2026-11-08", time: nil, due: nil, status: .open, completedAt: nil, completedBy: nil)])).isEmpty, "daily tasks have no reminders")

    // recalculation when the deadline changes; no duplicates when nothing changed
    let before = plan(snap(tasks: [dueIn("a", 5 * 3600)]))
    var pending = Dictionary(before.map { ($0.id, $0.signature) }, uniquingKeysWith: { a, _ in a })
    check(NotificationPlanner.diff(pending: pending, plan: before) == .init(add: [], remove: []), "unchanged data → empty diff (no duplicate scheduling)")
    let moved = plan(snap(tasks: [dueIn("a", 8 * 3600)]))
    let d = NotificationPlanner.diff(pending: pending, plan: moved)
    check(Set(d.remove) == Set(before.map(\.id)) && d.add.count == moved.count, "changed deadline → old reminders removed, new ones added")
    let gone = NotificationPlanner.diff(pending: pending, plan: plan(snap(tasks: [dueIn("a", 5 * 3600, status: .completed)])))
    check(gone.add.isEmpty && gone.remove.count == before.count, "completed → all pending reminders cancelled")
    let deleted = NotificationPlanner.diff(pending: pending, plan: plan(snap(tasks: [])))
    check(deleted.remove.count == before.count, "deleted → all pending reminders cancelled")
    pending["other.app.notification"] = "x"
    check(!NotificationPlanner.diff(pending: pending, plan: before).remove.contains("other.app.notification"), "only our own (prefixed) requests are ever removed")
    // progress of time: elapsed intervals drop out, nothing re-added
    let later = plan(snap(tasks: [dueIn("a", 5 * 3600)]), now: now0.addingTimeInterval(2 * 3600 + 10))
    check(!later.isEmpty && later.allSatisfy { $0.fireDate > now0.addingTimeInterval(2 * 3600 + 10) }, "later re-plan only contains future intervals")

    // timezone change: same instant & ids, different wall-clock text → signature differs → replaced
    var utcCal = Calendar(identifier: .gregorian); utcCal.timeZone = TimeZone(identifier: "UTC")!
    let s = snap(tasks: [dueIn("a", 5 * 3600)])
    let pi = NotificationPlanner.plan(s, now: now0, ist, prefs: prefs), pu = NotificationPlanner.plan(s, now: now0, utcCal, prefs: prefs)
    check(pi.map(\.id) == pu.map(\.id) && pi.map(\.fireDate) == pu.map(\.fireDate), "timezone change keeps ids and absolute fire instants")
    check(pi.first!.body != pu.first!.body, "…but the displayed clock time follows the device timezone")
    let pendingIST = Dictionary(pi.map { ($0.id, $0.signature) }, uniquingKeysWith: { a, _ in a })
    check(NotificationPlanner.diff(pending: pendingIST, plan: pu).add.count == pu.count - 1, "timezone change → text-bearing requests replaced (the clock-free exact-deadline one is unchanged)")

    // preferences
    check(plan(snap(tasks: [dueIn("a", 5 * 3600)]), p: NotificationPrefs(master: false)).isEmpty, "master off → nothing scheduled")
    check(plan(snap(tasks: [dueIn("a", 5 * 3600)]), p: NotificationPrefs(deadlines: false)).isEmpty, "deadline toggle off → no deadline reminders")

    // budget: soonest first
    let many = (0..<30).map { dueIn("t\($0)", Double(3 * 86400 + $0 * 60)) }
    let capped = plan(snap(tasks: many))
    check(capped.count == 60 && capped == capped.sorted { ($0.fireDate, $0.id) < ($1.fireDate, $1.id) }, "capped to 60, soonest first")

    // habit check-in at 9:30 PM local
    func habit(_ id: String, _ users: [String], days: [Int]? = nil, paused: Bool = false, log: [String: [String: LogEntry]] = [:]) -> WHabit {
        WHabit(id: id, title: "Habit \(id)", participants: users, days: days, paused: paused, startDate: "2026-11-01", log: log)
    }
    let hs = [habit("daily", ["me"]), habit("shared", ["me", "pa"]), habit("partner", ["pa"]), habit("paused", ["me"], paused: true),
              habit("monday", ["me"], days: [1]), habit("sunday", ["me"], days: [0]),
              habit("done", ["me"], log: ["me": ["2026-11-08": LogEntry(status: .done, at: now0)]]),
              habit("partnerDone", ["me", "pa"], log: ["pa": ["2026-11-08": LogEntry(status: .done, at: now0)]])]
    let hp = NotificationPlanner.habitPlan(snap(habits: hs), now: now0, ist)       // now = Sun 15:30 IST
    let today = hp.filter { $0.userInfo["day"] == "2026-11-08" }.map { $0.userInfo["habitId"]! }
    check(Set(today) == ["daily", "shared", "sunday", "partnerDone"], "today's check-in: only MY scheduled, unpaused, unlogged habits (got \(today.sorted()))")
    check(!today.contains("partner") && !today.contains("done"), "partner's personal habit and my completed habit are not asked")
    check(today.contains("partnerDone"), "partner completing a shared habit does NOT complete mine")
    let tomorrow = hp.filter { $0.userInfo["day"] == "2026-11-09" }.map { $0.userInfo["habitId"]! }
    check(Set(tomorrow) == ["daily", "shared", "monday", "done", "partnerDone"], "tomorrow (Monday): Monday habit appears, Sunday habit does not (got \(tomorrow.sorted()))")
    check(hp.allSatisfy { ist.component(.hour, from: $0.fireDate) == 21 && ist.component(.minute, from: $0.fireDate) == 30 }, "all check-ins fire at 9:30 PM local")
    check(hp.allSatisfy { $0.category == NotificationPlanner.habitCategory && !$0.absolute }, "check-ins use the Yes/No category and wall-clock time")
    let after930 = NotificationPlanner.habitPlan(snap(habits: hs), now: utc("2026-11-08T17:00:00Z"), ist)   // 22:30 IST Sunday
    check(after930.allSatisfy { $0.userInfo["day"] == "2026-11-09" }, "after 9:30 PM today only tomorrow's check-in remains")
    check(NotificationPlanner.plan(snap(habits: hs), now: now0, ist, prefs: NotificationPrefs(habits: false)).isEmpty, "habit toggle off → no check-ins")
    check(Set(hp.map(\.id)).count == hp.count, "one request per habit per day (no duplicates)")

    // stale delivered
    let s2 = snap(tasks: [dueIn("live", 3600), dueIn("done", 3600, status: .completed)])
    let liveDue = String(Int(now0.addingTimeInterval(3600).timeIntervalSince1970))
    let delivered: [(id: String, info: [String: String])] = [
        (id: "ourday.dl.live.\(liveDue).300", info: ["taskId": "live", "due": liveDue]),
        (id: "ourday.dl.done.\(liveDue).300", info: ["taskId": "done", "due": liveDue]),
        (id: "ourday.dl.gone.1.300", info: ["taskId": "gone", "due": "1"]),
        (id: "ourday.dl.live.999.300", info: ["taskId": "live", "due": "999"]),
        (id: "ourday.hb.x.2026-11-08", info: [:])]
    check(Set(NotificationPlanner.staleDeliveredDeadlineIDs(delivered: delivered, s2, now: now0)) == ["ourday.dl.done.\(liveDue).300", "ourday.dl.gone.1.300", "ourday.dl.live.999.300"], "stale delivered: completed, deleted, or old due time")
    let exp = snap(tasks: [dueIn("live", -10)])
    let afterExpiry = NotificationPlanner.staleDeliveredDeadlineIDs(delivered: [(id: "ourday.dl.live.\(Int(now0.addingTimeInterval(-10).timeIntervalSince1970)).300", info: ["taskId": "live", "due": String(Int(now0.addingTimeInterval(-10).timeIntervalSince1970))]),
                                                                             (id: "ourday.dl.live.\(Int(now0.addingTimeInterval(-10).timeIntervalSince1970)).0", info: ["taskId": "live", "due": String(Int(now0.addingTimeInterval(-10).timeIntervalSince1970))])], exp, now: now0)
    check(afterExpiry.count == 1 && afterExpiry[0].hasSuffix(".300"), "after expiry old reminders vanish; the exact-deadline one stays")
}
