import Foundation

/// Port of frontend/src/services/habits.ts (rules unchanged).
enum HabitDayState { case done, missed, pending, off }

enum HabitRules {
    static func isScheduled(_ h: WHabit, _ key: String, _ cal: Calendar) -> Bool {
        h.days == nil || h.days!.contains(DayKey.weekday(key, cal))
    }

    static func dayState(_ h: WHabit, user: String, key: String, today: String, _ cal: Calendar) -> HabitDayState {
        if key < h.startDate || !isScheduled(h, key, cal) { return .off }
        let e = h.log[user]?[key]
        if e?.status == .done { return .done }
        if key >= today { return e?.status == .missed ? .missed : .pending }
        return .missed
    }

    /// Consecutive completed scheduled days; a miss breaks it, unscheduled days do not, today's pending neither counts nor breaks.
    static func streak(_ h: WHabit, user: String, today: String, _ cal: Calendar) -> Int {
        var s = 0
        var key = today
        var guardCount = 0
        while key >= h.startDate && guardCount < 4000 {
            guardCount += 1
            switch dayState(h, user: user, key: key, today: today, cal) {
            case .done: s += 1
            case .missed: return s
            default: break
            }
            key = DayKey.add(key, -1, cal)
        }
        return s
    }

    /// Habits this user takes part in that are scheduled today (not paused, started).
    static func todays(_ habits: [WHabit], user: String, today: String, _ cal: Calendar) -> [WHabit] {
        habits.filter { !$0.paused && $0.participants.contains(user) && isScheduled($0, today, cal) && today >= $0.startDate }
    }
}
