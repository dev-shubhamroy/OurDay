import Foundation

// Executive report generation: structure, conditional sections, wording, timezone, permissions, determinism.
// Pure logic, fixture data only (no network, no UI).

private func report(_ s: DataSnapshot, now: Date = now0, cal: Calendar = ist, previous: BriefingState? = nil, stale: Bool = false) -> ExecutiveReport {
    BriefingEngine.build(snapshot: s, now: now, cal: cal, previous: previous, stale: stale).report
}
private func habit(_ id: String, _ title: String, who: [String], me: LogStatus? = nil, pa: LogStatus? = nil, days: [Int]? = nil) -> WHabit {
    var log: [String: [String: LogEntry]] = [:]
    if let me { log["me"] = ["2026-11-08": LogEntry(status: me, at: me == .done ? utc("2026-11-08T08:00:00Z") : nil)] }
    if let pa { log["pa"] = ["2026-11-08": LogEntry(status: pa, at: pa == .done ? utc("2026-11-08T09:00:00Z") : nil)] }
    return WHabit(id: id, title: title, participants: who, days: days, paused: false, startDate: "2026-11-01", log: log)
}

func runReportTests() {
    // ---- opening: greeting + date from LOCAL time ----
    do {
        let r = report(snap())
        check(r.greeting == "Good afternoon, Shubham.", "greeting uses local time (15:30 IST) and first name")
        check(r.dateLine == "Sunday, 8 November", "date line is the local weekday and date")
        check(r.intro == "I’ve reviewed your schedule for today. Here is your daily briefing.", "full report intro")
        let morning = utc("2026-11-08T04:00:00Z")   // 09:30 IST
        check(report(snap(), now: morning).greeting == "Good morning, Shubham.", "morning greeting")
        let night = utc("2026-11-08T15:00:00Z")      // 20:30 IST
        check(report(snap(), now: night).greeting == "Good evening, Shubham.", "evening greeting")
        // same instant, different device timezone → different local greeting and date
        var ny = Calendar(identifier: .gregorian); ny.timeZone = TimeZone(identifier: "America/New_York")!
        let nyR = report(snap(), now: now0, cal: ny)
        check(nyR.greeting.hasPrefix("Good morning") && nyR.dateLine == "Sunday, 8 November", "timezone respected (05:00 in New York)")
        let late = utc("2026-11-08T18:40:00Z")       // 00:10 on 9 Nov in IST
        check(report(snap(), now: late).dateLine == "Monday, 9 November", "date rolls over at local midnight")
    }

    // ---- busy day ----
    let tasks = [
        dl("d1", "Pay rent", due: "2026-11-08T12:00:00Z"),
        dl("d2", "Expired", due: "2026-11-08T09:00:00Z"),
        dl("d3", "Done today", due: "2026-11-08T13:00:00Z", status: .completed, doneBy: "me", doneAt: "2026-11-08T09:30:00Z"),
        dl("d4", "Evening", due: "2026-11-08T15:00:00Z"),
        daily("a", "Gym", day: "2026-11-08", time: "07:00", done: true), daily("b", "Call bank", day: "2026-11-08", time: "16:00"),
        daily("c", "Review", day: "2026-11-08", time: "13:00"), daily("e", "Email", day: "2026-11-08", time: "14:00"),
        daily("y1", "Old one", day: "2026-11-07"), daily("y2", "Old two", day: "2026-11-07"),
        dl("t1", "Tomorrow thing", due: "2026-11-09T05:00:00Z"),
    ]
    do {
        let r = report(snap(tasks: tasks))
        check(r.stats.map(\.id) == ["scheduled", "completed", "pending", "upcoming", "overdue"], "summary tiles incl. overdue when present")
        check(r.stats.map(\.value) == [8, 2, 5, 3, 1], "summary numbers: scheduled 8, done 2, pending 5, upcoming 3, overdue 1")
        check(r.schedule.map(\.id) == ["d2", "d1", "d3", "d4"], "schedule is chronological")
        check(r.schedule.map(\.state) == [.overdue, .critical, .completed, .approaching], "schedule states distinguish overdue/critical/completed/approaching")
        check(r.schedule[1].timeText == "5:30 PM" && r.schedule[1].detail == "2h 0m left", "entry shows deadline time and remaining time")
        check(r.schedule[0].detail == "Passed 1h 0m ago", "overdue entry wording")
        check(r.schedule[2].detail == "Completed at 3:00 PM", "completed entry wording")
        check(r.scheduleHeadline == "You have two deadlines still ahead today.", "schedule headline counts only upcoming")
        check(r.otherTasks.map(\.id) == ["c", "e", "b"], "open daily tasks listed by planned time")
        check(r.tomorrowLine == "Tomorrow: one deadline, the first “Tomorrow thing” at 10:30 AM.", "tomorrow preview")
        check(r.priority.map(\.id) == ["overdue", "p-d1", "p-d4", "yesterday", "afternoon"], "priority order: overdue, urgent, approaching, yesterday, afternoon")
        check(r.priority[0].text == "One deadline has passed without completion: “Expired”.", "overdue wording")
        check(r.priority[1].text == "“Pay rent” is due at 5:30 PM, 2h 0m left." && r.priority[1].level == .urgent, "critical deadline wording")
        check(r.priority[2].text == "You have a deadline approaching at 8:30 PM: “Evening”.", "approaching deadline wording")
        check(r.priority[3].text == "Two tasks remain incomplete from yesterday.", "yesterday wording")
        check(r.priority[4].text == "Your afternoon schedule is relatively busy.", "busy afternoon wording")
        check(r.closing == "That concludes your briefing. Four matters need your attention first. Your schedule is up to date.", "closing reflects real attention count")
    }

    // ---- quiet day: nothing fabricated, no empty sections ----
    do {
        let r = report(snap(partner: false))
        check(r.stats.isEmpty && r.schedule.isEmpty && r.priority.isEmpty && r.habits.isEmpty && r.habitsSummary == nil, "empty day has no stats/priority/habit sections")
        check(r.partner.isEmpty && r.partnerName == nil && r.tomorrowLine == nil && r.otherTasks.isEmpty, "no partner or tomorrow content invented")
        check(r.scheduleHeadline == "No deadlines are scheduled for today.", "clean empty-state statement")
        check(r.closing == "That concludes your briefing. Nothing is scheduled for today. Your schedule is up to date.", "quiet-day closing")
    }
    // light day: only one future deadline, no overdue → no overdue tile / warning
    do {
        let r = report(snap(tasks: [dl("x", "Later", due: "2026-11-12T05:00:00Z")]))
        check(!r.stats.contains { $0.id == "overdue" } && !r.priority.contains { $0.id == "overdue" }, "no overdue tile or warning when nothing is overdue")
        check(r.stats.first { $0.id == "upcoming" }?.value == 1, "upcoming counts future deadlines")
        check(r.priority.isEmpty, "a far deadline is not flagged")
    }
    // everything done
    do {
        let r = report(snap(tasks: [daily("a", "Gym", day: "2026-11-08", done: true), dl("d", "Done", due: "2026-11-08T13:00:00Z", status: .completed, doneBy: "me", doneAt: "2026-11-08T09:30:00Z")]))
        check(r.closing == "That concludes your briefing. Everything scheduled for today is complete. Your schedule is up to date.", "all-complete closing")
        check(r.scheduleHeadline == "All one of today’s deadlines are complete." || r.scheduleHeadline?.hasPrefix("All") == true, "all-complete headline")
    }
    // stale (cached) data never claims to be up to date
    do {
        let r = report(snap(tasks: [dl("x", "Later", due: "2026-11-12T05:00:00Z")]), stale: true)
        check(!r.closing.contains("up to date"), "cached report does not claim to be up to date")
    }

    // ---- habits ----
    do {
        check(report(snap(habits: [WHabit(id: "m", title: "Mondays", participants: ["me"], days: [1], paused: false, startDate: "2026-11-01", log: [:])])).habits.isEmpty, "habit not scheduled today → no habits section")
        let hs = [habit("h1", "Read", who: ["me"], me: .done), habit("h2", "Walk", who: ["me", "pa"], pa: .done), habit("h3", "Stretch", who: ["me"], me: .missed)]
        let r = report(snap(habits: hs))
        check(r.habits.map(\.state) == [.done, .pending, .missed], "habit states: done / pending / missed")
        check(r.habitsSummary == "One of three habits completed so far today.", "habit summary")
        check(r.habits[1].partnerLine == "Priya: done", "shared habit shows the partner's own status")
        check(r.habits[0].partnerLine == nil, "personal habit shows no partner line")
        check(report(snap(habits: [habit("z", "Read", who: ["me"])])).habitsSummary == "Your habit is still to do today.", "zero-done habit summary")
        let yd = WHabit(id: "yd", title: "Journal", participants: ["me"], days: nil, paused: false, startDate: "2026-11-01", log: [:])
        check(report(snap(habits: [yd])).priority.contains { $0.id == "habits-missed" && $0.text == "One habit was missed yesterday." }, "missed habit yesterday reported")
    }

    // ---- partner permissions ----
    do {
        let priv = habit("pp", "Private journal", who: ["pa"], pa: .done)            // partner-only habit
        let shared = habit("sh", "Walk", who: ["me", "pa"], pa: .done)
        let sharedPending = habit("sp", "Stretch", who: ["me", "pa"])
        let r = report(snap(tasks: [dl("pd", "Partner task", due: "2026-11-08T13:00:00Z", by: "pa", status: .completed, doneBy: "pa", doneAt: "2026-11-08T09:30:00Z")], habits: [priv, shared, sharedPending]))
        check(!r.partner.contains { $0.contains("Private journal") }, "partner-private habit is never reported")
        check(r.partner.contains("Priya checked in “Walk” at 2:30 PM"), "shared habit check-in reported")
        check(r.partner.contains("Priya completed “Partner task” at 3:00 PM"), "partner task completion reported")
        check(r.partner.contains("Priya has one shared habit still to do today"), "pending count covers shared habits only")
        check(r.partnerName == "Priya", "partner name from workspace members")
        check(report(snap(partner: false)).partner.isEmpty, "no partner → no partner section")
    }

    // ---- update report: concise ----
    do {
        let prevSnap = snap(tasks: [dl("d1", "Pay rent", due: "2026-11-08T12:00:00Z")])
        let state = BriefingEngine.stateAfter(prevSnap, now: utc("2026-11-08T06:00:00Z"), cal: ist)
        let later = snap(tasks: [dl("d1", "Pay rent", due: "2026-11-08T12:00:00Z", status: .completed, doneBy: "pa", doneAt: "2026-11-08T09:00:00Z")])
        let r = report(later, previous: state)
        check(r.kind == .update && r.stats.isEmpty && r.schedule.isEmpty && r.habits.isEmpty && r.scheduleHeadline == nil, "update report has no full-report sections")
        check(r.intro == "Here is your update since your last briefing at 11:30 AM.", "update intro uses the previous briefing time")
        check(r.partnerChanges == ["Priya completed deadline “Pay rent”"] && r.ownChanges.isEmpty, "update lists partner changes separately")
        check(r.closing.hasPrefix("That concludes your update."), "update closing")
        let unchanged = report(prevSnap, now: utc("2026-11-08T06:05:00Z"), previous: state)
        check(unchanged.closing == "That concludes your update. Nothing has changed since your last briefing. Your schedule is up to date.", "no-change update closing")
        check(unchanged.nextDeadline?.id == "d1", "update shows the next active deadline")
    }

    // ---- deterministic ----
    check(report(snap(tasks: tasks)) == report(snap(tasks: tasks)), "same data → identical report")
    // no AI / chat artefacts in any wording
    do {
        let r = report(snap(tasks: tasks))
        let all = ([r.intro, r.closing] + r.priority.map(\.text) + (r.scheduleHeadline.map { [$0] } ?? [])).joined(separator: " ").lowercased()
        check(!all.contains("?") && !all.contains("would you like") && !all.contains("i recommend"), "report contains no questions or recommendations")
    }
}
