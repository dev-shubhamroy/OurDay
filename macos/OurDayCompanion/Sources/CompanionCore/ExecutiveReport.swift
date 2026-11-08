import Foundation

// RANA's executive report: a deterministic, data-only structure the briefing window renders.
// No AI, no scoring, no invented data. Every sentence is derived from the DataSnapshot by fixed rules, and a
// section whose data is empty is simply absent (nil / empty array) so the UI never shows hollow sections.

enum ScheduleState: String, Equatable { case upcoming, approaching, critical, completed, overdue }
enum StatTone: String, Equatable { case neutral, good, warn, alert }
enum PriorityLevel: String, Equatable { case urgent, attention, info }
enum ReportHabitState: String, Equatable { case done, pending, missed }

struct ReportStat: Identifiable, Equatable { var id: String; var label: String; var value: Int; var tone: StatTone }
struct ScheduleEntry: Identifiable, Equatable {
    var id: String; var title: String; var timeText: String; var detail: String; var state: ScheduleState; var ownerName: String?
}
struct TaskLine: Identifiable, Equatable { var id: String; var title: String; var timeText: String?; var ownerName: String? }
struct PriorityLine: Identifiable, Equatable { var id: String; var text: String; var level: PriorityLevel }
struct ReportHabit: Identifiable, Equatable {
    var id: String; var title: String; var state: ReportHabitState; var streak: Int; var partnerLine: String?
}

struct ExecutiveReport: Equatable {
    var kind: BriefingKind
    var greeting: String
    var dateLine: String
    var intro: String
    var stats: [ReportStat] = []
    var scheduleHeadline: String? = nil          // full report only; always present (empty-state sentence when nothing is due)
    var schedule: [ScheduleEntry] = []
    var scheduleMore: Int = 0
    var otherTasks: [TaskLine] = []
    var otherTasksMore: Int = 0
    var tomorrowLine: String? = nil
    var priority: [PriorityLine] = []
    var habitsSummary: String? = nil
    var habits: [ReportHabit] = []
    var habitsNote: String? = nil
    var partnerName: String? = nil
    var partner: [String] = []
    var ownChanges: [String] = []
    var partnerChanges: [String] = []
    var sinceText: String? = nil
    var nextDeadline: ScheduleEntry? = nil
    var closing: String
}

enum ExecutiveReportBuilder {
    static let scheduleLimit = 8
    static let taskLimit = 5

    static func cap(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }
    static func names(_ titles: [String], max: Int = 2) -> String {
        let q = titles.prefix(max).map { "“\($0)”" }
        let rest = titles.count - q.count
        if rest > 0 { return q.joined(separator: ", ") + " and \(BriefingEngine.word(rest)) more" }
        return q.count == 2 ? "\(q[0]) and \(q[1])" : q.joined()
    }
    static func dateLine(_ now: Date, _ cal: Calendar) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.calendar = cal; f.timeZone = cal.timeZone; f.dateFormat = "EEEE, d MMMM"
        return f.string(from: now)
    }
    static func agoText(_ s: TimeInterval) -> String {
        let m = max(1, Int(s / 60)); if m >= 1440 { return "\(m / 1440)d ago" }; if m >= 60 { return "\(m / 60)h \(m % 60)m ago" }; return "\(m)m ago"
    }

    static func entry(_ t: WTask, _ s: DataSnapshot, now: Date, _ cal: Calendar) -> ScheduleEntry {
        let due = t.due ?? now
        let state: ScheduleState
        let detail: String
        if t.status == .completed {
            state = .completed
            let by = s.name(of: t.completedBy ?? t.createdBy)
            detail = "Completed" + (t.completedAt.map { " at \(BriefingEngine.timeText($0, cal))" } ?? "") + (t.completedBy != s.meID && t.completedBy != nil ? " by \(by)" : "")
        } else if due <= now {
            state = .overdue; detail = "Passed \(agoText(now.timeIntervalSince(due)))"
        } else {
            let u = BriefingEngine.urgency(remaining: due.timeIntervalSince(now))
            state = u == .critical ? .critical : u == .approaching ? .approaching : .upcoming
            detail = BriefingEngine.remainingText(due.timeIntervalSince(now))
        }
        return ScheduleEntry(id: t.id, title: t.title, timeText: BriefingEngine.timeText(due, cal), detail: detail, state: state, ownerName: t.createdBy == s.meID ? nil : s.name(of: t.createdBy))
    }

    static func build(snapshot s: DataSnapshot, now: Date, cal: Calendar, kind: BriefingKind, changes: [Change], previousAt: Date?, stale: Bool) -> ExecutiveReport {
        let today = DayKey.key(now, cal), tomorrow = DayKey.add(today, 1, cal), yesterday = DayKey.add(today, -1, cal)
        let first = s.me?.name.split(separator: " ").first.map(String.init)
        let greeting = BriefingEngine.greeting(now, cal) + (first.map { ", \($0)." } ?? ".")

        // ---- deadlines & tasks ----------------------------------------------------------------------
        let deadlines = s.tasks.filter { $0.kind == .deadline && $0.due != nil }
        let todayDL = deadlines.filter { $0.date == today }.sorted { ($0.due!, $0.id) < ($1.due!, $1.id) }
        let activeAll = deadlines.filter { $0.status == .open && $0.due! > now }
        let overdueAll = deadlines.filter { $0.status == .open && $0.due! <= now }.sorted { $0.due! > $1.due! }
        let dailyToday = s.tasks.filter { $0.kind == .daily && $0.date == today }
        let openDaily = dailyToday.filter { $0.status == .open }.sorted { ($0.time ?? "99:99", $0.id) < ($1.time ?? "99:99", $1.id) }
        let yesterdayOpen = s.tasks.filter { $0.kind == .daily && $0.date == yesterday && $0.status == .open }

        let scheduled = todayDL.count + dailyToday.count
        let completed = todayDL.filter { $0.status == .completed }.count + dailyToday.filter { $0.status == .completed }.count
        let overdueToday = todayDL.filter { $0.status == .open && $0.due! <= now }.count
        let pending = scheduled - completed - overdueToday

        // ---- habits (mine; partner status only for habits we share) ------------------------------------
        let myHabits = HabitRules.todays(s.habits, user: s.meID, today: today, cal)
        let habitRows: [ReportHabit] = myHabits.map { h in
            let e = h.log[s.meID]?[today]
            let state: ReportHabitState = e?.status == .done ? .done : e?.status == .missed ? .missed : .pending
            let other = h.isShared ? h.participants.first { $0 != s.meID } : nil
            let pl = other.map { o -> String in "\(s.name(of: o)): " + (h.log[o]?[today]?.status == .done ? "done" : "to do") }
            return ReportHabit(id: h.id, title: h.title, state: state, streak: HabitRules.streak(h, user: s.meID, today: today, cal), partnerLine: pl)
        }
        let habitsDone = habitRows.filter { $0.state == .done }.count
        let habitsOpen = habitRows.filter { $0.state == .pending }.count
        let missedYesterday = s.habits.filter { !$0.paused && $0.participants.contains(s.meID) && today > $0.startDate &&
            HabitRules.dayState($0, user: s.meID, key: yesterday, today: today, cal) == .missed }.count

        // ---- priority (fixed rules, no scores) -------------------------------------------------------
        var priority: [PriorityLine] = []
        if !overdueAll.isEmpty {
            let n = overdueAll.count
            priority.append(PriorityLine(id: "overdue", text: "\(cap(BriefingEngine.word(n))) \(BriefingEngine.plural(n, "deadline")) \(n == 1 ? "has" : "have") passed without completion: \(names(overdueAll.map(\.title))).", level: .urgent))
        }
        for t in activeAll.filter({ $0.date == today }).sorted(by: { $0.due! < $1.due! }).prefix(3) {
            let rem = t.due!.timeIntervalSince(now), tt = BriefingEngine.timeText(t.due!, cal)
            switch BriefingEngine.urgency(remaining: rem) {
            case .critical: priority.append(PriorityLine(id: "p-\(t.id)", text: "“\(t.title)” is due at \(tt), \(BriefingEngine.remainingText(rem)).", level: .urgent))
            case .approaching: priority.append(PriorityLine(id: "p-\(t.id)", text: "You have a deadline approaching at \(tt): “\(t.title)”.", level: .attention))
            case .normal: break
            }
        }
        if !yesterdayOpen.isEmpty {
            let n = yesterdayOpen.count
            priority.append(PriorityLine(id: "yesterday", text: "\(cap(BriefingEngine.word(n))) \(BriefingEngine.plural(n, "task")) \(n == 1 ? "remains" : "remain") incomplete from yesterday.", level: .attention))
        }
        // "Busy afternoon": three or more open items timed 12:00–17:59 today (deadlines + planned tasks).
        let afternoon = activeAll.filter { $0.date == today && (12..<18).contains(cal.component(.hour, from: $0.due!)) }.count
            + openDaily.filter { t in t.time.flatMap { Int($0.prefix(2)) }.map { (12..<18).contains($0) } ?? false }.count
        if afternoon >= 3 { priority.append(PriorityLine(id: "afternoon", text: "Your afternoon schedule is relatively busy.", level: .info)) }
        if missedYesterday > 0 { priority.append(PriorityLine(id: "habits-missed", text: "\(cap(BriefingEngine.word(missedYesterday))) \(BriefingEngine.plural(missedYesterday, "habit")) \(missedYesterday == 1 ? "was" : "were") missed yesterday.", level: .info)) }

        // ---- partner (permissions: shared items only; partner-private habits are never reported) -------
        var partnerLines: [String] = []
        if let p = s.partner {
            let pn = s.name(of: p.id)
            var events: [(Date, String)] = []
            for t in s.tasks where t.status == .completed && t.completedBy == p.id {
                if let c = t.completedAt, DayKey.key(c, cal) == today { events.append((c, "\(pn) completed “\(t.title)” at \(BriefingEngine.timeText(c, cal))")) }
            }
            for h in s.habits where !h.paused && h.participants.contains(s.meID) && h.participants.contains(p.id) {
                if let e = h.log[p.id]?[today], e.status == .done, let at = e.at { events.append((at, "\(pn) checked in “\(h.title)” at \(BriefingEngine.timeText(at, cal))")) }
            }
            partnerLines = events.sorted { $0.0 > $1.0 }.prefix(5).map { $0.1 }
            let sharedPending = HabitRules.todays(s.habits, user: p.id, today: today, cal).filter { $0.participants.contains(s.meID) && $0.log[p.id]?[today]?.status != .done }.count
            if sharedPending > 0 { partnerLines.append("\(pn) has \(BriefingEngine.word(sharedPending)) shared \(BriefingEngine.plural(sharedPending, "habit")) still to do today") }
        }
        let partnerName = s.partner.map { s.name(of: $0.id) }

        let nextActive = activeAll.sorted { $0.due! < $1.due! }.first
        let upToDate = stale ? "" : " Your schedule is up to date."

        var r = ExecutiveReport(kind: kind, greeting: greeting, dateLine: dateLine(now, cal), intro: "", closing: "")
        r.priority = priority
        r.partnerName = partnerName

        if kind == .update {
            r.intro = previousAt.map { "Here is your update since your last briefing at \(BriefingEngine.timeText($0, cal))." } ?? "Here is your update."
            r.ownChanges = changes.filter { !$0.byPartner }.map(\.text)
            r.partnerChanges = changes.filter { $0.byPartner }.map(\.text)
            r.nextDeadline = nextActive.map { entry($0, s, now: now, cal) }
            let urgent = priority.filter { $0.level != .info }.count
            r.closing = changes.isEmpty
                ? "That concludes your update. Nothing has changed since your last briefing." + upToDate
                : "That concludes your update." + (urgent > 0 ? " \(cap(BriefingEngine.word(urgent))) \(BriefingEngine.plural(urgent, "item")) \(urgent == 1 ? "needs" : "need") your attention." : upToDate)
            return r
        }

        r.intro = "I’ve reviewed your schedule for today. Here is your daily briefing."
        // Executive summary: only meaningful numbers (overdue appears only when non-zero).
        if scheduled > 0 || !activeAll.isEmpty || !overdueAll.isEmpty {
            r.stats = [ReportStat(id: "scheduled", label: "Scheduled today", value: scheduled, tone: .neutral),
                       ReportStat(id: "completed", label: "Completed", value: completed, tone: completed > 0 ? .good : .neutral),
                       ReportStat(id: "pending", label: "Pending", value: pending, tone: .neutral),
                       ReportStat(id: "upcoming", label: "Upcoming deadlines", value: activeAll.count, tone: .neutral)]
            if !overdueAll.isEmpty { r.stats.append(ReportStat(id: "overdue", label: "Overdue", value: overdueAll.count, tone: .alert)) }
        }
        // Today's schedule (deadlines, chronological).
        r.schedule = todayDL.prefix(scheduleLimit).map { entry($0, s, now: now, cal) }
        r.scheduleMore = max(0, todayDL.count - scheduleLimit)
        let openToday = todayDL.filter { $0.status == .open && $0.due! > now }.count
        if todayDL.isEmpty { r.scheduleHeadline = "No deadlines are scheduled for today." }
        else if openToday == 0 { r.scheduleHeadline = "All \(BriefingEngine.word(todayDL.count)) of today’s \(BriefingEngine.plural(todayDL.count, "deadline")) \(overdueToday == 0 ? "are complete" : "have been handled or have passed")." }
        else { r.scheduleHeadline = "You have \(BriefingEngine.word(openToday)) \(BriefingEngine.plural(openToday, "deadline")) still ahead today." }
        r.otherTasks = openDaily.prefix(taskLimit).map { TaskLine(id: $0.id, title: $0.title, timeText: $0.time.map(BriefingEngine.clockText), ownerName: $0.createdBy == s.meID ? nil : s.name(of: $0.createdBy)) }
        r.otherTasksMore = max(0, openDaily.count - taskLimit)
        let tomorrowDL = deadlines.filter { $0.date == tomorrow && $0.status == .open }.sorted { $0.due! < $1.due! }
        if let f = tomorrowDL.first {
            r.tomorrowLine = "Tomorrow: \(BriefingEngine.word(tomorrowDL.count)) \(BriefingEngine.plural(tomorrowDL.count, "deadline")), the first “\(f.title)” at \(BriefingEngine.timeText(f.due!, cal))."
        }
        // Habits: absent entirely when none are scheduled.
        if !habitRows.isEmpty {
            r.habits = habitRows
            let n = habitRows.count
            r.habitsSummary = n == 1 ? (habitsDone == 1 ? "Your habit is completed today." : "Your habit is still to do today.")
                : habitsDone == 0 ? "None of \(BriefingEngine.word(n)) \(BriefingEngine.plural(n, "habit")) completed yet today."
                : habitsDone == n ? "All \(BriefingEngine.word(n)) \(BriefingEngine.plural(n, "habit")) completed today."
                : "\(cap(BriefingEngine.word(habitsDone))) of \(BriefingEngine.word(n)) \(BriefingEngine.plural(n, "habit")) completed so far today."
        }
        r.partner = partnerLines
        // Closing: facts only; never promises monitoring.
        let outstanding = pending + habitsOpen + overdueToday
        if scheduled == 0 && habitRows.isEmpty && overdueAll.isEmpty && activeAll.isEmpty {
            r.closing = "That concludes your briefing. Nothing is scheduled for today." + upToDate
        } else if priority.contains(where: { $0.level == .urgent || $0.level == .attention }) {
            let n = priority.filter { $0.level == .urgent || $0.level == .attention }.count
            r.closing = "That concludes your briefing. \(cap(BriefingEngine.word(n))) \(BriefingEngine.plural(n, "matter")) \(n == 1 ? "needs" : "need") your attention first." + upToDate
        } else if outstanding == 0 {
            r.closing = "That concludes your briefing. Everything scheduled for today is complete." + upToDate
        } else {
            r.closing = "That concludes your briefing. \(cap(BriefingEngine.word(outstanding))) \(BriefingEngine.plural(outstanding, "item")) remain open today." + upToDate
        }
        return r
    }
}
