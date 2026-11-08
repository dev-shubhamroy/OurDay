import Foundation

// Executive report generation (fixture data, pure logic): attention list, schedule, missed habits, partner, closing.

private func report(_ s: DataSnapshot, now: Date = now0, cal: Calendar = ist, previous: BriefingState? = nil, stale: Bool = false) -> ExecutiveReport {
    BriefingEngine.build(snapshot: s, now: now, cal: cal, previous: previous, stale: stale).report
}
private func habit(_ id: String, _ title: String, who: [String], me: LogStatus? = nil, pa: LogStatus? = nil, days: [Int]? = nil, yesterday: LogStatus? = nil) -> WHabit {
    var log: [String: [String: LogEntry]] = [:]
    if let me { log["me", default: [:]]["2026-11-08"] = LogEntry(status: me, at: me == .done ? utc("2026-11-08T08:00:00Z") : nil) }
    if let yesterday { log["me", default: [:]]["2026-11-07"] = LogEntry(status: yesterday, at: nil) }
    if let pa { log["pa"] = ["2026-11-08": LogEntry(status: pa, at: pa == .done ? utc("2026-11-08T09:00:00Z") : nil)] }
    return WHabit(id: id, title: title, participants: who, days: days, paused: false, startDate: "2026-11-01", log: log)
}

func runReportTests() {
    // ---- opening ----
    do {
        let r = report(snap())
        check(r.greeting == "Good afternoon, Shubham.", "greeting uses local time and first name")
        check(r.greetingLead == "Good afternoon," && r.greetingName == "Shubham.", "greeting split so the name can be emphasised")
        check(r.dateLine == "Sunday, 8 November", "date line")
        check(r.intro == "I’ve reviewed your schedule for today. Here is your daily briefing.", "full intro")
        check(report(snap(), now: utc("2026-11-08T04:00:00Z")).greeting == "Good morning, Shubham.", "morning")
        check(report(snap(), now: utc("2026-11-08T15:00:00Z")).greeting == "Good evening, Shubham.", "evening")
        var ny = Calendar(identifier: .gregorian); ny.timeZone = TimeZone(identifier: "America/New_York")!
        check(report(snap(), now: now0, cal: ny).greeting.hasPrefix("Good morning"), "timezone respected")
        check(report(snap(), now: utc("2026-11-08T18:40:00Z")).dateLine == "Monday, 9 November", "date rolls over at local midnight")
    }
    // ---- no statistics anywhere in the model ----
    check(ExecutiveReport.attentionIntro == "These are some tasks that need your attention urgently." && ExecutiveReport.scheduleIntro == "You need to work on these today.", "exact section wording")

    // ---- multiple urgent tasks, listed one by one ----
    let tasks = [
        dl("o1", "Send invoice", due: "2026-11-08T09:00:00Z"),                       // overdue today (14:30 IST)
        dl("o2", "File taxes", due: "2026-11-06T09:00:00Z"),                         // overdue from Friday
        dl("c1", "Submit application", due: "2026-11-08T12:00:00Z"),                 // 2h left → critical
        dl("a1", "Project report", due: "2026-11-08T15:00:00Z", by: "pa"),           // 5h → approaching
        dl("n1", "Prepare slides", due: "2026-11-08T18:20:00Z"),                     // 9h → normal (schedule)
        dl("d3", "Done today", due: "2026-11-08T13:00:00Z", status: .completed, doneBy: "me", doneAt: "2026-11-08T09:30:00Z"),
        daily("t1", "Call bank", day: "2026-11-08", time: "16:00"), daily("t2", "Review notes", day: "2026-11-08", time: "13:00"),
        daily("t3", "Water plants", day: "2026-11-08"),
        daily("y1", "Old errand", day: "2026-11-07"),
        dl("tm", "Tomorrow thing", due: "2026-11-09T05:00:00Z"),
    ]
    do {
        let r = report(snap(tasks: tasks))
        check(r.attention.map(\.id) == ["o1", "o2", "c1", "a1", "y1"], "attention: overdue (newest first), critical, approaching, then work left from yesterday; each task individually")
        check(r.attention.map(\.status) == ["Overdue", "Overdue", "Due soon", "Approaching", "From yesterday"], "attention statuses")
        check(r.attention[0].title == "Send invoice" && r.attention[0].detail == "Was due 2:30 PM · 1h 0m ago", "overdue detail names the task and when")
        check(r.attention[1].detail.hasPrefix("Was due Fri 6 Nov, 2:30 PM"), "older overdue shows its date")
        check(r.attention[2].detail == "5:30 PM · 2h 0m left" && r.attention[2].level == .critical, "critical detail")
        check(r.attention[3].ownerName == "Priya", "attention shows owner when it is the partner's")
        check(r.schedule.map(\.id) == ["t2", "n1", "t1", "t3"] || r.schedule.map(\.id) == ["t2", "t1", "n1", "t3"], "schedule chronological, untimed last")
        check(r.schedule.map(\.id).sorted() == ["n1", "t1", "t2", "t3"], "no task is duplicated between attention and schedule; completed tasks omitted")
        check(r.schedule.first { $0.id == "n1" }?.timeText == "11:50 PM" && r.schedule.first { $0.id == "n1" }?.detail == "Due in 8h 20m", "schedule entry shows deadline time and remaining time")
        check(r.schedule.first { $0.id == "t3" }?.timeText == "Any time", "untimed task")
        check(r.closing == "Let’s take care of the urgent items and keep the rest on track.", "closing with urgent work")
    }
    // ---- no urgent tasks ----
    do {
        let r = report(snap(tasks: [dl("n1", "Prepare slides", due: "2026-11-08T18:20:00Z"), daily("t1", "Call bank", day: "2026-11-08", time: "16:00"), daily("t2", "Email", day: "2026-11-08", time: "17:00"), daily("t3", "Gym", day: "2026-11-08", time: "18:00")]))
        check(r.attention.isEmpty && r.schedule.count == 4, "no urgent items → attention empty (panel hidden)")
        check(r.closing == "Nothing is urgent. Let’s work through today’s plan one step at a time.", "busy-but-calm closing")
        let light = report(snap(tasks: [daily("t1", "Call bank", day: "2026-11-08", time: "16:00")]))
        check(light.closing == "You have a relatively clear day ahead. Let’s make good use of it.", "light day closing")
        let quiet = report(snap(partner: false))
        check(quiet.attention.isEmpty && quiet.schedule.isEmpty && quiet.emptyDayNote == "Nothing is scheduled for today." && quiet.missedHabits.isEmpty && quiet.partnerLines.isEmpty, "quiet day: nothing invented")
        check(quiet.closing == "You have a clear day ahead. Let’s make good use of it.", "quiet closing")
        let done = report(snap(tasks: [daily("a", "Gym", day: "2026-11-08", done: true)]))
        check(done.emptyDayNote == "Everything planned for today is complete.", "all complete note")
        check(!done.closing.contains("up to date"), "closing never claims the schedule is up to date")
    }
    // the closing never calls things "up to date" when overdue work exists
    check(!report(snap(tasks: tasks)).closing.lowercased().contains("up to date"), "no 'up to date' with overdue work")

    // ---- long lists stay complete in the model (the window scrolls) ----
    do {
        let many = (1...12).map { dl("m\($0)", "Overdue \($0)", due: "2026-11-08T0\($0 % 9 + 1):00:00Z") }
        check(report(snap(tasks: many)).attention.count == 12, "long attention list keeps every task")
    }

    // ---- habits: missed only, conversational, no counts ----
    do {
        check(report(snap(habits: [habit("h1", "Read", who: ["me"], me: .done, yesterday: .done)])).missedHabits.isEmpty, "no missed habits → section data empty")
        let hs = [habit("h1", "Meditation", who: ["me"], yesterday: .missed), habit("h2", "Gym", who: ["me", "pa"]), habit("h3", "Stretch", who: ["me"], me: .missed),
                  WHabit(id: "h4", title: "Mondays", participants: ["me"], days: [1], paused: false, startDate: "2026-11-01", log: [:])]
        let r = report(snap(habits: hs))
        check(r.missedHabits.contains("You forgot to do Meditation yesterday."), "missed yesterday sentence")
        check(r.missedHabits.contains("You forgot to do Gym yesterday."), "unlogged scheduled shared habit counts as missed (existing rules)")
        check(r.missedHabits.contains("You skipped Stretch today."), "answered No today")
        check(!r.missedHabits.contains { $0.contains("Mondays") }, "habit not scheduled yesterday is not reported")
        check(!r.missedHabits.joined().contains(where: { $0.isNumber }), "no counts in habit sentences")
        let paused = WHabit(id: "p", title: "Paused", participants: ["me"], days: nil, paused: true, startDate: "2026-11-01", log: [:])
        check(report(snap(habits: [paused])).missedHabits.isEmpty, "paused habits are never reported")
    }

    // ---- partner: named, shared only ----
    do {
        let priv = habit("pp", "Private journal", who: ["pa"], pa: .done)
        let shared = habit("sh", "Walk", who: ["me", "pa"], pa: .done)
        let one = report(snap(tasks: [dl("pd", "Partner task", due: "2026-11-08T13:00:00Z", by: "pa", status: .completed, doneBy: "pa", doneAt: "2026-11-08T09:30:00Z")], habits: [priv, shared]))
        check(one.partnerName == "Priya", "partner shown by name")
        check(one.partnerLines == ["Priya completed “Partner task” today.", "Priya checked in on Walk today."], "partner lines name the partner and shared items")
        check(!one.partnerLines.joined().contains("Private journal"), "partner-private habit never reported")
        func pdone(_ n: Int) -> [WTask] { (1...n).map { dl("p\($0)", "T\($0)", due: "2026-11-08T13:00:00Z", by: "pa", status: .completed, doneBy: "pa", doneAt: "2026-11-08T09:30:00Z") } }
        check(report(snap(tasks: pdone(2))).partnerLines == ["Priya completed “T1” and “T2” today."], "two tasks listed")
        check(report(snap(tasks: pdone(5))).partnerLines == ["Priya completed five tasks today."], "many tasks summarised")
        check(report(snap(tasks: [])).partnerLines.isEmpty, "no partner activity → hidden")
        check(report(snap(partner: false)).partnerName == nil, "no partner → no name")
    }

    // ---- update report ----
    do {
        let prevSnap = snap(tasks: [dl("d1", "Pay rent", due: "2026-11-08T17:00:00Z")])
        let state = BriefingEngine.stateAfter(prevSnap, now: utc("2026-11-08T06:00:00Z"), cal: ist)
        let later = snap(tasks: [dl("d1", "Pay rent", due: "2026-11-08T17:00:00Z", status: .completed, doneBy: "pa", doneAt: "2026-11-08T09:00:00Z")])
        let r = report(later, previous: state)
        check(r.kind == .update && r.schedule.isEmpty && r.missedHabits.isEmpty && r.intro == "Here is what has changed since your last briefing at 11:30 AM.", "update report is concise")
        check(r.partnerChanges == ["Priya completed deadline “Pay rent”"] && r.ownChanges.isEmpty, "update lists partner changes separately")
        check(r.closing == "Nothing urgent has come up. Let’s keep going.", "update closing without urgent work")
        let unchanged = report(prevSnap, now: utc("2026-11-08T06:05:00Z"), previous: state)
        check(unchanged.closing == "Nothing has changed, and nothing is urgent.", "no-change update closing")
        let urgent = report(snap(tasks: [dl("o", "Late thing", due: "2026-11-08T09:00:00Z")]), previous: state)
        check(urgent.attention.map(\.id) == ["o"] && urgent.closing == "Let’s take care of the urgent items first.", "update still surfaces urgent work")
    }
    check(report(snap(tasks: tasks)) == report(snap(tasks: tasks)), "same data → identical report")
}
