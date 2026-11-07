import Foundation

/// Local calendar-day keys (`YYYY-MM-DD`) in the calendar's timezone, which defaults to the device's.
enum DayKey {
    static func key(_ d: Date, _ cal: Calendar) -> String { BriefingDay.key(for: d, calendar: cal) }

    static func date(_ key: String, _ cal: Calendar) -> Date {
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return Date(timeIntervalSince1970: 0) }
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12)) ?? Date(timeIntervalSince1970: 0)
    }
    static func add(_ k: String, _ n: Int, _ cal: Calendar) -> String {
        let base = date(k, cal)
        return key(cal.date(byAdding: .day, value: n, to: base) ?? base, cal)
    }
    /// 0 = Sunday … 6 = Saturday (matches the database and web app).
    static func weekday(_ key: String, _ cal: Calendar) -> Int { cal.component(.weekday, from: date(key, cal)) - 1 }
}
