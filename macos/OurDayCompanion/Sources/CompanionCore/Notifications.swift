import Foundation

struct NotificationPrefs: Codable, Equatable {
    var master = true
    var deadlines = true
    var habits = true
    var partner = true
    /// Mac only: show the RANA briefing window on unlock. Independent of notifications.
    var unlockBriefing = true

    init(master: Bool = true, deadlines: Bool = true, habits: Bool = true, partner: Bool = true, unlockBriefing: Bool = true) {
        self.master = master; self.deadlines = deadlines; self.habits = habits; self.partner = partner; self.unlockBriefing = unlockBriefing
    }
    // Older saved values lack newer keys: fall back to defaults instead of failing.
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: Keys.self)
        master = try c.decodeIfPresent(Bool.self, forKey: .master) ?? true
        deadlines = try c.decodeIfPresent(Bool.self, forKey: .deadlines) ?? true
        habits = try c.decodeIfPresent(Bool.self, forKey: .habits) ?? true
        partner = try c.decodeIfPresent(Bool.self, forKey: .partner) ?? true
        unlockBriefing = try c.decodeIfPresent(Bool.self, forKey: .unlockBriefing) ?? true
    }
    private enum Keys: String, CodingKey { case master, deadlines, habits, partner, unlockBriefing }
}

/// `public.notification_preferences` row (shared with the web app).
struct PrefsRow: Codable, Equatable {
    var master: Bool; var deadlines: Bool; var habits: Bool; var partner: Bool; var unlock_briefing: Bool; var timezone: String
    init(_ p: NotificationPrefs, timezone: String) {
        master = p.master; deadlines = p.deadlines; habits = p.habits; partner = p.partner; unlock_briefing = p.unlockBriefing; self.timezone = timezone
    }
    var prefs: NotificationPrefs { NotificationPrefs(master: master, deadlines: deadlines, habits: habits, partner: partner, unlockBriefing: unlock_briefing) }
}

/// `public.notifications` row: shared history with read/unread state.
struct NotificationRow: Codable, Equatable, Identifiable {
    var id: String; var kind: String; var title: String; var body: String
    var task_id: String?; var habit_id: String?; var actor_id: String?
    var occurred_at: String; var read_at: String?
    var isUnread: Bool { read_at == nil }
    var date: Date { Parse.iso(occurred_at) ?? .distantPast }
    /// Where the dashboard should open for this notification.
    var dashboardPath: String { habit_id != nil || kind == "habit" ? "/habits" : kind == "deadline" ? "/deadlines" : "/home" }
}

enum CentreRules {
    /// Partner rows worth an OS alert now: unread, not alerted before, recent (older ones stay in the centre only,
    /// so reconnecting after a long absence never floods the screen), and allowed by the preferences.
    static func alerts(_ rows: [NotificationRow], seen: Set<String>, now: Date, prefs: NotificationPrefs, window: TimeInterval = 30 * 60) -> [NotificationRow] {
        guard prefs.master, prefs.partner else { return [] }
        return rows.filter { $0.kind == "partner" && $0.isUnread && !seen.contains($0.id) && now.timeIntervalSince($0.date) <= window }
            .sorted { $0.date < $1.date }
    }
    static func unread(_ rows: [NotificationRow]) -> Int { rows.filter(\.isUnread).count }
    /// Unread check-in rows for a habit/day that the person has just answered.
    static func answeredCheckIns(_ rows: [NotificationRow], habitID: String) -> [String] {
        rows.filter { $0.kind == "habit" && $0.habit_id == habitID && $0.isUnread }.map(\.id)
    }
}

/// One OS notification the engine wants to exist. Pure data; the app layer turns it into a UNNotificationRequest.
struct PlannedNotification: Equatable {
    enum Kind: String { case deadline, habit }
    var id: String
    var fireDate: Date
    var title: String
    var body: String
    var kind: Kind
    var threadID: String
    var userInfo: [String: String]
    /// Pinned to an absolute instant (deadline reminders) rather than a wall-clock time (habit check-in).
    var absolute: Bool
    var category: String?

    /// Changes whenever anything the user would see changes, so a stale pending request gets replaced.
    var signature: String { "\(Int(fireDate.timeIntervalSince1970))|\(title)|\(body)" }
}

enum NotificationPlanner {
    static let managedPrefix = "ourday."
    /// Exactly the required intervals; 0 is the exact deadline.
    static let deadlineIntervals: [(seconds: TimeInterval, label: String)] = [
        (24 * 3600, "24 hours"), (12 * 3600, "12 hours"), (6 * 3600, "6 hours"), (3 * 3600, "3 hours"), (2 * 3600, "2 hours"),
        (3600, "1 hour"), (1800, "30 minutes"), (900, "15 minutes"), (300, "5 minutes"), (0, "")]
    /// Safety margin: nothing is scheduled closer than this to "now".
    static let minLead: TimeInterval = 2
    /// Pending-request budget kept below the 64 limit documented for local notifications.
    static let defaultLimit = 60
    static let checkInHour = 21, checkInMinute = 30
    static let checkInDaysAhead = 2

    // MARK: Deadlines

    /// Who gets reminders for a deadline: its creator, plus the other member when "Notify second user" is on.
    static func receivesReminders(_ t: WTask, me: String) -> Bool { t.createdBy == me || t.notifyOther }

    static func deadlinePlan(_ s: DataSnapshot, now: Date, _ cal: Calendar) -> [PlannedNotification] {
        var out: [PlannedNotification] = []
        for t in s.tasks where t.kind == .deadline && t.status == .open && receivesReminders(t, me: s.meID) {
            guard let due = t.due, due > now.addingTimeInterval(minLead) else { continue }   // never completed, never expired
            let owner = t.createdBy == s.meID ? nil : s.name(of: t.createdBy)
            let when = "\(t.date == DayKey.key(now, cal) ? "today" : BriefingEngine.shortDate(t.date, cal)) at \(BriefingEngine.timeText(due, cal))"
            for iv in deadlineIntervals {
                let fire = due.addingTimeInterval(-iv.seconds)
                guard fire > now.addingTimeInterval(minLead) else { continue }               // only future intervals
                let title = iv.seconds == 0 ? "Deadline now" : "Due in \(iv.label)"
                let body = "“\(t.title)”" + (owner.map { " (\($0)’s)" } ?? "") + (iv.seconds == 0 ? " is due now." : " is due \(when).")
                out.append(PlannedNotification(
                    id: "\(managedPrefix)dl.\(t.id).\(Int(due.timeIntervalSince1970)).\(Int(iv.seconds))",
                    fireDate: fire, title: title, body: body, kind: .deadline, threadID: "deadline-\(t.id)",
                    userInfo: ["kind": "deadline", "taskId": t.id, "due": String(Int(due.timeIntervalSince1970))], absolute: true, category: nil))
            }
        }
        return out
    }

    // MARK: Habit check-in (9:30 PM device-local)

    static let habitCategory = "OURDAY_HABIT_CHECKIN"

    /// Habits this user is asked about on `day`: scheduled that day, started, not paused, theirs (personal or shared),
    /// and not already logged. Each person is only ever asked about their own occurrence.
    static func checkInHabits(_ s: DataSnapshot, day: String, _ cal: Calendar) -> [WHabit] {
        HabitRules.todays(s.habits, user: s.meID, today: day, cal).filter { $0.log[s.meID]?[day] == nil }
    }

    static func habitPlan(_ s: DataSnapshot, now: Date, _ cal: Calendar) -> [PlannedNotification] {
        var out: [PlannedNotification] = []
        let today = DayKey.key(now, cal)
        for offset in 0..<checkInDaysAhead {
            let day = DayKey.add(today, offset, cal)
            let p = day.split(separator: "-").compactMap { Int($0) }
            guard p.count == 3, let fire = cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: checkInHour, minute: checkInMinute)),
                  fire > now.addingTimeInterval(minLead) else { continue }
            for h in checkInHabits(s, day: day, cal) {
                out.append(PlannedNotification(
                    id: "\(managedPrefix)hb.\(h.id).\(day)", fireDate: fire, title: "Habit check-in",
                    body: "Did you complete “\(h.title)” today?", kind: .habit, threadID: "habit-checkin-\(day)",
                    userInfo: ["kind": "habit", "habitId": h.id, "day": day], absolute: false, category: habitCategory))
            }
        }
        return out
    }

    // MARK: Whole plan

    static func plan(_ s: DataSnapshot, now: Date, _ cal: Calendar, prefs: NotificationPrefs, limit: Int = defaultLimit) -> [PlannedNotification] {
        guard prefs.master else { return [] }
        var all: [PlannedNotification] = []
        if prefs.deadlines { all += deadlinePlan(s, now: now, cal) }
        if prefs.habits { all += habitPlan(s, now: now, cal) }
        all.sort { ($0.fireDate, $0.id) < ($1.fireDate, $1.id) }
        return Array(all.prefix(limit))      // soonest first; later ones are added as time passes and the plan is rebuilt
    }

    struct Diff: Equatable { var add: [PlannedNotification]; var remove: [String] }

    /// Reconciles what the OS holds with what we want. Same id + same signature = untouched (no duplicates);
    /// same id + changed content = replaced; ids we manage that are no longer planned = removed.
    static func diff(pending: [String: String], plan: [PlannedNotification]) -> Diff {
        let wanted = Dictionary(plan.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let remove = pending.keys.filter { $0.hasPrefix(managedPrefix) && wanted[$0] == nil }.sorted()
        let add = plan.filter { pending[$0.id] != $0.signature }
        return Diff(add: add, remove: remove)
    }

    /// Delivered deadline notifications that should vanish: the task is gone, completed, or has a different due time
    /// (stale reminders). Once a deadline passes, its reminders go too, except the exact-deadline one ("…​.0") which stays readable.
    static func staleDeliveredDeadlineIDs(delivered: [(id: String, info: [String: String])], _ s: DataSnapshot, now: Date) -> [String] {
        let tasks = Dictionary(s.tasks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return delivered.compactMap { d in
            guard d.id.hasPrefix(managedPrefix + "dl."), let tid = d.info["taskId"] else { return nil }
            guard let t = tasks[tid], t.status == .open, let due = t.due, String(Int(due.timeIntervalSince1970)) == d.info["due"] else { return d.id }
            if due <= now && !d.id.hasSuffix(".0") { return d.id }
            return nil
        }
    }
}
