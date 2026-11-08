import Foundation

// RANA's executive report: deterministic, data-only. No AI, no statistics, no invented content.
// A section with nothing to say is simply empty, and the window hides it.

enum AttentionLevel: String, Equatable { case overdue, critical, approaching, carried }
enum ScheduleKind: String, Equatable { case deadline, approaching, task }

struct AttentionItem: Identifiable, Equatable {
    var id: String; var title: String
    var status: String          // "Overdue", "Due soon", "Approaching", "From yesterday"
    var detail: String          // when it was / is due, and the time left
    var level: AttentionLevel
    var ownerName: String?
}
struct ScheduleEntry: Identifiable, Equatable {
    var id: String; var title: String
    var timeText: String        // "5:30 PM" or "Any time"
    var detail: String          // "5h 30m left" / "Planned task"
    var kind: ScheduleKind; var ownerName: String?
}

struct ExecutiveReport: Equatable {
    static let attentionIntro = "These are some tasks that need your attention urgently."
    static let scheduleIntro = "You need to work on these today."

    var kind: BriefingKind
    var greeting: String
    var greetingLead: String = ""              // "Good evening,"
    var greetingName: String = ""              // "Shubham" (emphasised by the window)
    var dateLine: String
    var intro: String
    var attention: [AttentionItem] = []
    var schedule: [ScheduleEntry] = []
    var emptyDayNote: String? = nil              // only when there is nothing urgent and nothing scheduled
    var missedHabits: [String] = []              // conversational sentences, one per missed habit
    var missedHabitTitles: [String] = []         // the habit name inside each sentence (the window highlights it)
    var partnerName: String? = nil
    var partnerLines: [String] = []
    var sinceTitle: String? = nil                // update report: "Since 9:30 AM"
    var ownChanges: [String] = []                // update report
    var partnerChanges: [String] = []
    var closing: String
    var quote: QuoteLine? = nil                    // "JUST KNOW THAT –": one saved quote per briefing; hidden when the library is empty
}

enum ExecutiveReportBuilder {
    static func cap(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }
    static func dateLine(_ now: Date, _ cal: Calendar) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.calendar = cal; f.timeZone = cal.timeZone; f.dateFormat = "EEEE, d MMMM"
        return f.string(from: now)
    }
    /// "Due in 5 min", "Due in 2h 14m", "Due in 3d 4h" (the number part).
    static func dueInText(_ s: TimeInterval) -> String {
        let mins = max(1, Int(s / 60)); let d = mins / 1440, h = (mins % 1440) / 60, m = mins % 60
        if d > 0 { return "\(d)d \(h)h" }; if h > 0 { return "\(h)h \(m)m" }; return "\(m) min"
    }
    static func agoText(_ s: TimeInterval) -> String {
        let m = max(1, Int(s / 60)); if m >= 1440 { return "\(m / 1440)d ago" }; if m >= 60 { return "\(m / 60)h \(m % 60)m ago" }; return "\(m)m ago"
    }
    static func minutes(_ hhmm: String?) -> Int { // sort key; untimed tasks go last
        guard let p = hhmm?.split(separator: ":").compactMap({ Int($0) }), p.count >= 2 else { return 24 * 60 }
        return p[0] * 60 + p[1]
    }
    static func listJoin(_ items: [String]) -> String {
        let q = items.map { "“\($0)”" }
        return q.count <= 1 ? q.joined() : q.dropLast().joined(separator: ", ") + " and " + q.last!
    }

    static func build(snapshot s: DataSnapshot, now: Date, cal: Calendar, kind: BriefingKind, changes: [Change], previousAt: Date?, stale: Bool, quote: QuoteLine? = nil) -> ExecutiveReport {
        let today = DayKey.key(now, cal), yesterday = DayKey.add(today, -1, cal)
        let first = s.me?.name.split(separator: " ").first.map(String.init)
        var r = ExecutiveReport(kind: kind, greeting: BriefingEngine.greeting(now, cal) + (first.map { ", \($0)." } ?? "."),
                                greetingLead: BriefingEngine.greeting(now, cal) + (first == nil ? "." : ","), greetingName: first.map { $0 + "." } ?? "",
                                dateLine: dateLine(now, cal), intro: "", closing: "")
        r.quote = quote   // both the full and the update briefing carry it

        // ---- Needs attention: overdue, critical (≤3h), approaching (≤8h) deadlines; work left from yesterday --------
        let open = s.tasks.filter { $0.kind == .deadline && $0.status == .open && $0.due != nil }
        func owner(_ t: WTask) -> String? { t.createdBy == s.meID ? nil : s.name(of: t.createdBy) }
        func when(_ d: Date) -> String {
            let k = DayKey.key(d, cal)
            return (k == today ? "" : (k == DayKey.add(today, 1, cal) ? "Tomorrow, " : BriefingEngine.shortDate(k, cal) + ", ")) + BriefingEngine.timeText(d, cal)
        }
        var attention: [AttentionItem] = []
        for t in open.filter({ $0.due! <= now }).sorted(by: { $0.due! > $1.due! }) {
            attention.append(AttentionItem(id: t.id, title: t.title, status: "Overdue", detail: "Was due \(when(t.due!)) · \(agoText(now.timeIntervalSince(t.due!)))", level: .overdue, ownerName: owner(t)))
        }
        for t in open.filter({ $0.due! > now }).sorted(by: { $0.due! < $1.due! }) {
            let rem = t.due!.timeIntervalSince(now)
            switch BriefingEngine.urgency(remaining: rem) {
            case .critical: attention.append(AttentionItem(id: t.id, title: t.title, status: "Due soon", detail: "\(when(t.due!)) · \(BriefingEngine.remainingText(rem))", level: .critical, ownerName: owner(t)))
            case .approaching: attention.append(AttentionItem(id: t.id, title: t.title, status: "Approaching", detail: "\(when(t.due!)) · \(BriefingEngine.remainingText(rem))", level: .approaching, ownerName: owner(t)))
            case .normal: break
            }
        }
        for t in s.tasks.filter({ $0.kind == .daily && $0.date == yesterday && $0.status == .open }).sorted(by: { $0.id < $1.id }) {
            attention.append(AttentionItem(id: t.id, title: t.title, status: "From yesterday", detail: "Still open", level: .carried, ownerName: owner(t)))
        }
        r.attention = attention
        let attentionIDs = Set(attention.map(\.id))

        // ---- Today's schedule: what is still to do today, chronologically; urgent items live in Needs Attention only ----
        var plan: [(Int, ScheduleEntry)] = []
        for t in open where t.due! > now && t.date == today && !attentionIDs.contains(t.id) {
            let c = cal.dateComponents([.hour, .minute], from: t.due!)
            plan.append(((c.hour ?? 0) * 60 + (c.minute ?? 0), ScheduleEntry(id: t.id, title: t.title, timeText: BriefingEngine.timeText(t.due!, cal), detail: "Due in " + dueInText(t.due!.timeIntervalSince(now)), kind: .deadline, ownerName: owner(t))))
        }
        for t in s.tasks where t.kind == .daily && t.date == today && t.status == .open {
            plan.append((minutes(t.time), ScheduleEntry(id: t.id, title: t.title, timeText: t.time.map(BriefingEngine.clockText) ?? "Any time", detail: "Planned task", kind: .task, ownerName: owner(t))))
        }
        r.schedule = plan.sorted { ($0.0, $0.1.id) < ($1.0, $1.1.id) }.map(\.1)
        let doneToday = s.tasks.contains { $0.status == .completed && $0.date == today }
        if attention.isEmpty && r.schedule.isEmpty { r.emptyDayNote = doneToday ? "Everything planned for today is complete." : "Nothing is scheduled for today." }

        // ---- Habits: only what was missed (yesterday, or answered "No" today); never counts -------------------------
        let mine = s.habits.filter { !$0.paused && $0.participants.contains(s.meID) }
        for h in mine where today > h.startDate && HabitRules.dayState(h, user: s.meID, key: yesterday, today: today, cal) == .missed {
            r.missedHabits.append("You forgot to do \(h.title) yesterday."); r.missedHabitTitles.append(h.title)
        }
        for h in mine where HabitRules.isScheduled(h, today, cal) && today >= h.startDate && h.log[s.meID]?[today]?.status == .missed {
            r.missedHabits.append("You skipped \(h.title) today."); r.missedHabitTitles.append(h.title)
        }

        // ---- Partner: named, shared items only; hidden when nothing meaningful ---------------------------------------
        if let p = s.partner {
            let pn = s.name(of: p.id)
            r.partnerName = pn
            let done = s.tasks.filter { $0.status == .completed && $0.completedBy == p.id && $0.completedAt.map { DayKey.key($0, cal) == today } == true }.map(\.title)
            if done.count == 1 { r.partnerLines.append("\(pn) completed “\(done[0])” today.") }
            else if (2...3).contains(done.count) { r.partnerLines.append("\(pn) completed \(listJoin(done)) today.") }
            else if done.count > 3 { r.partnerLines.append("\(pn) completed \(BriefingEngine.word(done.count)) tasks today.") }
            for h in s.habits where !h.paused && h.participants.contains(s.meID) && h.participants.contains(p.id) {     // shared habits only
                if h.log[p.id]?[today]?.status == .done { r.partnerLines.append("\(pn) checked in on \(h.title) today.") }
            }
        }

        let urgent = !attention.isEmpty
        if kind == .update {
            r.intro = previousAt.map { "Here is what has changed since your last briefing at \(BriefingEngine.timeText($0, cal))." } ?? "Here is what has changed."
            r.sinceTitle = previousAt.map { "Since \(BriefingEngine.timeText($0, cal))" }
            r.ownChanges = changes.filter { !$0.byPartner }.map(\.text)
            r.partnerChanges = changes.filter { $0.byPartner }.map(\.text)
            r.partnerLines = []
            r.schedule = []; r.missedHabits = []; r.missedHabitTitles = []; r.emptyDayNote = nil
            r.closing = urgent ? "Let’s take care of the urgent items first." : (changes.isEmpty ? "Nothing has changed, and nothing is urgent." : "Nothing urgent has come up. Let’s keep going.")
            return r
        }
        r.intro = "I’ve reviewed your schedule for today. Here is your daily briefing."
        if urgent { r.closing = r.schedule.isEmpty ? "Let’s take care of the urgent items first." : "Let’s take care of the urgent items and keep the rest on track." }
        else if r.schedule.isEmpty { r.closing = r.emptyDayNote == "Everything planned for today is complete." ? "Everything planned for today is complete. Enjoy the rest of your day." : "You have a clear day ahead. Let’s make good use of it." }
        else if r.schedule.count <= 2 { r.closing = "You have a relatively clear day ahead. Let’s make good use of it." }
        else { r.closing = "Nothing is urgent. Let’s work through today’s plan one step at a time." }
        return r
    }
}
