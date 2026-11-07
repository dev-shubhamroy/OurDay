import Foundation

public enum BriefingKind: Equatable {
    case full      // first unlock of the local calendar day
    case update    // later unlocks the same day
}

/// Decides full vs. compact briefing from the last briefing day, in the user's local timezone.
public struct BriefingDay {
    public static func key(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    public static func kind(lastBriefingDay: String?, now: Date, calendar: Calendar = .current) -> BriefingKind {
        lastBriefingDay == key(for: now, calendar: calendar) ? .update : .full
    }
}
