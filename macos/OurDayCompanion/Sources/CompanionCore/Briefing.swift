import Foundation

enum Urgency: String { case normal, approaching, critical }

struct DeadlineItem: Identifiable, Equatable {
    var id: String; var title: String; var due: Date
    var remaining: TimeInterval; var urgency: Urgency
    var dayLabel: String; var timeText: String; var ownerName: String?
}
struct TaskItem: Identifiable, Equatable {
    var id: String; var title: String; var timeText: String?; var done: Bool; var ownerName: String?; var doneBy: String?
}
struct HabitItem: Identifiable, Equatable {
    var id: String; var title: String; var done: Bool; var streak: Int; var partnerName: String?; var partnerDone: Bool?
}
struct Change: Identifiable, Equatable { var id: String; var text: String; var byPartner: Bool }

struct Briefing: Equatable {
    var kind: BriefingKind
    var generatedAt: Date
    var greeting: String
    var summary: [String]
    var deadlinesToday: [DeadlineItem]
    var deadlinesTomorrow: [DeadlineItem]
    var deadlinesUpcoming: [DeadlineItem]
    var upcomingMore: Int
    var completedDeadlinesToday: Int
    var tasksToday: [TaskItem]
    var tasksTomorrow: [TaskItem]
    var habits: [HabitItem]
    var partnerName: String?
    var together: [String]
    var changes: [Change]
    var nextUp: DeadlineItem?
    var previousAt: Date?
    /// The executive report the window renders (same data, structured; see ExecutiveReport.swift).
    var report: ExecutiveReport
}

/// Persisted between launches. Holds ids and short status words only (no titles or other content).
struct BriefingState: Codable, Equatable {
    var userID: String
    var day: String
    var at: Date
    var fingerprint: [String: String]
}

enum BriefingEngine {
    static let criticalSeconds: TimeInterval = 3 * 3600
    static let approachingSeconds: TimeInterval = 8 * 3600
    static let upcomingLimit = 3

    static func urgency(remaining: TimeInterval) -> Urgency {
        remaining <= criticalSeconds ? .critical : (remaining <= approachingSeconds ? .approaching : .normal)
    }

    static func timeText(_ d: Date, _ cal: Calendar) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.calendar = cal; f.timeZone = cal.timeZone; f.dateFormat = "h:mm a"
        return f.string(from: d)
    }
    static func clockText(_ hhmm: String) -> String {
        let p = hhmm.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return hhmm }
        return String(format: "%d:%02d %@", p[0] % 12 == 0 ? 12 : p[0] % 12, p[1], p[0] < 12 ? "AM" : "PM")
    }
    static func shortDate(_ key: String, _ cal: Calendar) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.calendar = cal; f.timeZone = cal.timeZone; f.dateFormat = "EEE d MMM"
        return f.string(from: DayKey.date(key, cal))
    }
    /// "2h 14m left", "35m left", "3d 4h left" (same wording as the web app).
    static func remainingText(_ s: TimeInterval) -> String {
        if s <= 0 { return "Time is up" }
        let mins = max(1, Int(s / 60))
        let d = mins / 1440, h = (mins % 1440) / 60, m = mins % 60
        if d > 0 { return "\(d)d \(h)h left" }
        if h > 0 { return "\(h)h \(m)m left" }
        return "\(m)m left"
    }
    static func greeting(_ now: Date, _ cal: Calendar) -> String {
        let h = cal.component(.hour, from: now)
        return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
    }
    static func word(_ n: Int) -> String {
        let w = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
        return n >= 0 && n < w.count ? w[n] : String(n)
    }
    static func plural(_ n: Int, _ one: String) -> String { n == 1 ? one : one + "s" }

    // MARK: Active deadline = open and not yet past due

    static func activeDeadlines(_ s: DataSnapshot, now: Date) -> [WTask] {
        s.tasks.filter { $0.kind == .deadline && $0.status == .open && ($0.due ?? .distantPast) > now }
            .sorted { ($0.due ?? .distantFuture) < ($1.due ?? .distantFuture) }
    }

    private static func deadlineItem(_ t: WTask, _ s: DataSnapshot, now: Date, today: String, _ cal: Calendar) -> DeadlineItem {
        let due = t.due ?? now
        let rem = due.timeIntervalSince(now)
        let label = t.date == today ? "Today" : t.date == DayKey.add(today, 1, cal) ? "Tomorrow" : shortDate(t.date, cal)
        return DeadlineItem(id: t.id, title: t.title, due: due, remaining: rem, urgency: urgency(remaining: rem),
                            dayLabel: label, timeText: timeText(due, cal), ownerName: t.createdBy == s.meID ? nil : s.name(of: t.createdBy))
    }

    private static func taskItem(_ t: WTask, _ s: DataSnapshot) -> TaskItem {
        TaskItem(id: t.id, title: t.title, timeText: t.time.map(clockText), done: t.status == .completed,
                 ownerName: t.createdBy == s.meID ? nil : s.name(of: t.createdBy),
                 doneBy: t.status == .completed ? s.name(of: t.completedBy ?? t.createdBy) : nil)
    }

    private static func byPlan(_ a: WTask, _ b: WTask) -> Bool {
        (a.time ?? "99:99", a.id) < (b.time ?? "99:99", b.id)
    }

    // MARK: Fingerprint (what the briefing "knew"); compared next time to find relevant changes

    static func fingerprint(_ s: DataSnapshot, now: Date, _ cal: Calendar) -> [String: String] {
        let today = DayKey.key(now, cal), tomorrow = DayKey.add(today, 1, cal)
        var f: [String: String] = [:]
        for t in s.tasks {
            switch t.kind {
            case .deadline:
                guard let due = t.due else { continue }
                if t.status == .completed {
                    if let c = t.completedAt, DayKey.key(c, cal) == today { f["d:\(t.id)"] = "completed" }
                } else if due <= now {
                    if now.timeIntervalSince(due) < 2 * 86400 { f["d:\(t.id)"] = "expired" }
                } else {
                    f["d:\(t.id)"] = "open-\(urgency(remaining: due.timeIntervalSince(now)).rawValue)"
                }
            case .daily:
                if t.date == today || t.date == tomorrow { f["t:\(t.id)"] = t.status == .completed ? "done" : "open" }
            }
        }
        for h in HabitRules.todays(s.habits, user: s.meID, today: today, cal) + (s.partner.map { HabitRules.todays(s.habits, user: $0.id, today: today, cal) } ?? []) {
            for u in h.participants where u == s.meID || u == s.partner?.id {
                f["h:\(h.id):\(u)"] = h.log[u]?[today]?.status == .done ? "done" : "pending"
            }
        }
        return f
    }

    // MARK: Changes since the previous briefing

    static func changes(from prev: [String: String], snapshot s: DataSnapshot, now: Date, _ cal: Calendar) -> [Change] {
        let cur = fingerprint(s, now: now, cal)
        let today = DayKey.key(now, cal)
        var out: [Change] = []
        let tasks = Dictionary(s.tasks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let habits = Dictionary(s.habits.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for key in cur.keys.sorted() {
            let new = cur[key]!, old = prev[key]
            if new == old { continue }
            let parts = key.split(separator: ":").map(String.init)
            switch parts[0] {
            case "d":
                guard let t = tasks[parts[1]] else { continue }
                let item = deadlineItem(t, s, now: now, today: today, cal)
                if old == nil {
                    if new.hasPrefix("open") { out.append(Change(id: key, text: "New deadline “\(t.title)” — \(item.dayLabel), \(item.timeText)", byPartner: t.createdBy != s.meID)) }
                } else if new == "completed" {
                    let who = t.completedBy ?? t.createdBy
                    out.append(Change(id: key, text: "\(s.name(of: who)) completed deadline “\(t.title)”", byPartner: who != s.meID))
                } else if new == "expired" {
                    out.append(Change(id: key, text: "Deadline “\(t.title)” has passed", byPartner: false))
                } else if new == "open-critical" {
                    out.append(Change(id: key, text: "“\(t.title)” is now critical — \(remainingText(item.remaining))", byPartner: false))
                } else if new == "open-approaching", old == "open-normal" {
                    out.append(Change(id: key, text: "“\(t.title)” is approaching — \(remainingText(item.remaining))", byPartner: false))
                }
            case "t":
                guard let t = tasks[parts[1]] else { continue }
                if old == nil {
                    out.append(Change(id: key, text: "New task “\(t.title)” for \(t.date == today ? "today" : "tomorrow")", byPartner: t.createdBy != s.meID))
                } else if new == "done" {
                    let who = t.completedBy ?? t.createdBy
                    out.append(Change(id: key, text: "\(s.name(of: who)) completed “\(t.title)”", byPartner: who != s.meID))
                }
            case "h":
                guard old != nil, new == "done", let h = habits[parts[1]] else { continue }
                out.append(Change(id: key, text: "\(s.name(of: parts[2])) completed habit “\(h.title)”", byPartner: parts[2] != s.meID))
            default: break
            }
        }
        return out
    }

    // MARK: Build

    static func build(snapshot s: DataSnapshot, now: Date, cal: Calendar, previous: BriefingState?, stale: Bool = false) -> Briefing {
        let today = DayKey.key(now, cal), tomorrow = DayKey.add(today, 1, cal)
        let kind: BriefingKind = (previous?.userID == s.meID && previous?.day == today) ? .update : .full

        let active = activeDeadlines(s, now: now).map { deadlineItem($0, s, now: now, today: today, cal) }
        let dToday = active.filter { $0.dayLabel == "Today" }
        let dTomorrow = active.filter { $0.dayLabel == "Tomorrow" }
        let later = active.filter { $0.dayLabel != "Today" && $0.dayLabel != "Tomorrow" }
        let completedToday = s.tasks.filter { $0.kind == .deadline && $0.status == .completed && $0.date == today }.count

        let daily = s.tasks.filter { $0.kind == .daily }
        func tasksOn(_ day: String) -> [TaskItem] {
            let l = daily.filter { $0.date == day }.sorted(by: byPlan).map { taskItem($0, s) }
            return l.filter { !$0.done } + l.filter { $0.done }
        }

        let myHabits = HabitRules.todays(s.habits, user: s.meID, today: today, cal).map { h -> HabitItem in
            let other = h.isShared ? h.participants.first { $0 != s.meID } : nil
            return HabitItem(id: h.id, title: h.title, done: h.log[s.meID]?[today]?.status == .done,
                             streak: HabitRules.streak(h, user: s.meID, today: today, cal),
                             partnerName: other.map { s.name(of: $0) }, partnerDone: other.map { h.log[$0]?[today]?.status == .done })
        }

        // Together: what the partner did today (visible to both under workspace rules)
        var together: [String] = []
        if let p = s.partner {
            let pn = s.name(of: p.id)
            var events: [(Date, String)] = []
            for t in s.tasks where t.status == .completed && t.completedBy == p.id {
                if let c = t.completedAt, DayKey.key(c, cal) == today { events.append((c, "\(pn) completed “\(t.title)” at \(timeText(c, cal))")) }
            }
            for h in s.habits where !h.paused {
                if let e = h.log[p.id]?[today], e.status == .done, let at = e.at { events.append((at, "\(pn) checked in “\(h.title)” at \(timeText(at, cal))")) }
            }
            together = events.sorted { $0.0 > $1.0 }.prefix(5).map { $0.1 }
            let pending = HabitRules.todays(s.habits, user: p.id, today: today, cal).filter { $0.log[p.id]?[today]?.status != .done }.count
            if pending > 0 { together.append("\(pn) has \(word(pending)) \(plural(pending, "habit")) still to do today") }
        }

        var changes: [Change] = []
        if kind == .update, let prev = previous { changes = Self.changes(from: prev.fingerprint, snapshot: s, now: now, cal) }

        let name = s.me?.name.split(separator: " ").first.map(String.init) ?? "there"
        return Briefing(
            kind: kind, generatedAt: now, greeting: "\(greeting(now, cal)), \(name)!",
            summary: summaryLines(dToday: dToday, dailyToday: tasksOn(today).filter { !$0.done }.count, habitsToday: myHabits.count),
            deadlinesToday: dToday, deadlinesTomorrow: dTomorrow,
            deadlinesUpcoming: Array(later.prefix(upcomingLimit)), upcomingMore: max(0, later.count - upcomingLimit),
            completedDeadlinesToday: completedToday,
            tasksToday: tasksOn(today), tasksTomorrow: tasksOn(tomorrow),
            habits: myHabits, partnerName: s.partner.map { s.name(of: $0.id) }, together: together,
            changes: changes, nextUp: active.first, previousAt: kind == .update ? previous?.at : nil,
            report: ExecutiveReportBuilder.build(snapshot: s, now: now, cal: cal, kind: kind, changes: changes, previousAt: kind == .update ? previous?.at : nil, stale: stale))
    }

    /// Same deterministic wording as frontend/src/services/rana.ts.
    static func summaryLines(dToday: [DeadlineItem], dailyToday: Int, habitsToday: Int) -> [String] {
        var l: [String] = []
        let urgent = dToday.filter { $0.urgency != .normal }
        if dToday.isEmpty { l.append("No deadlines today, so you can focus on the day itself.") }
        else {
            var s = "You have \(word(dToday.count)) \(plural(dToday.count, "deadline")) today."
            if urgent.count == 1 && dToday.count > 1 { s += " One of them is approaching, so let’s make sure you don’t miss it." }
            else if urgent.count > 1 { s += " A few are approaching, so let’s tackle them first." }
            else if urgent.count == 1 { s += " It’s approaching, so let’s get it done early." }
            l.append(s)
            l.append("The soonest is “\(dToday[0].title)” — \(remainingText(dToday[0].remaining)).")
        }
        l.append(dailyToday == 0 ? "Your daily task list is clear." : "You also have \(word(dailyToday)) \(plural(dailyToday, "task")) planned for today.")
        if habitsToday > 0 { l.append("And \(word(habitsToday)) \(plural(habitsToday, "habit")) to keep your streaks going.") }
        return l
    }

    static func stateAfter(_ s: DataSnapshot, now: Date, cal: Calendar) -> BriefingState {
        BriefingState(userID: s.meID, day: DayKey.key(now, cal), at: now, fingerprint: fingerprint(s, now: now, cal))
    }
}
