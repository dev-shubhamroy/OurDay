import Foundation

// MARK: Rows exactly as PostgREST returns them (existing schema; no second data model)

struct TaskRow: Codable, Equatable {
    var id: String; var kind: String; var title: String; var notes: String?
    var created_by: String; var notify_second_user: Bool
    var task_date: String; var planned_time: String?; var due_at: String?
    var status: String; var completed_at: String?; var completed_by: String?; var created_at: String
}
struct HabitRow: Codable, Equatable {
    var id: String; var title: String; var created_by: String
    var is_shared: Bool; var owner_id: String?; var schedule_days: [Int]?
    var paused: Bool; var start_date: String
}
struct HabitLogRow: Codable, Equatable {
    var habit_id: String; var user_id: String; var day: String; var status: String; var done_at: String?
}
struct MemberRow: Codable, Equatable { var user_id: String; var role: String; var joined_at: String }
struct ProfileRow: Codable, Equatable { var id: String; var name: String }

// MARK: Domain

enum TaskKind: String { case daily, deadline }
enum TaskStatus: String { case open, completed }

struct WTask: Equatable {
    var id: String; var kind: TaskKind; var title: String; var createdBy: String
    /// Local calendar day (viewer's timezone for deadlines, planned day for daily tasks).
    var date: String
    var time: String?          // "HH:mm" planned time (daily)
    var due: Date?             // deadline instant
    var status: TaskStatus
    var completedAt: Date?; var completedBy: String?
}

enum LogStatus { case done, missed }
struct LogEntry: Equatable { var status: LogStatus; var at: Date? }

struct WHabit: Equatable {
    var id: String; var title: String
    var participants: [String]
    var days: [Int]?           // nil = every day; 0 = Sunday … 6 = Saturday
    var paused: Bool; var startDate: String
    var log: [String: [String: LogEntry]]   // user → day → entry
    var isShared: Bool { participants.count > 1 }
}

struct Member: Equatable { var id: String; var name: String; var role: String }

/// Everything the signed-in member can see (RLS scopes it to their workspace).
struct DataSnapshot: Equatable {
    var meID: String
    var members: [Member]
    var tasks: [WTask]
    var habits: [WHabit]
    var fetchedAt: Date

    var me: Member? { members.first { $0.id == meID } }
    var partner: Member? { members.first { $0.id != meID } }
    func name(of id: String?) -> String {
        guard let id else { return "Someone" }
        if id == meID { return "You" }
        return members.first { $0.id == id }?.name.split(separator: " ").first.map(String.init) ?? "Your partner"
    }
}

// MARK: Parsing

enum Parse {
    private static let frac: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    private static let plain = ISO8601DateFormatter()
    static func iso(_ s: String?) -> Date? {
        guard let s else { return nil }
        return plain.date(from: s) ?? frac.date(from: s)
            ?? frac.date(from: s.replacingOccurrences(of: #"(\.\d{3})\d+"#, with: "$1", options: .regularExpression))
    }
}

enum Mapper {
    static func task(_ r: TaskRow, _ cal: Calendar) -> WTask? {
        guard let kind = TaskKind(rawValue: r.kind), let status = TaskStatus(rawValue: r.status) else { return nil }
        let due = Parse.iso(r.due_at)
        let date = (kind == .deadline && due != nil) ? DayKey.key(due!, cal) : r.task_date
        return WTask(id: r.id, kind: kind, title: r.title, createdBy: r.created_by, date: date,
                     time: r.planned_time.map { String($0.prefix(5)) }, due: due, status: status,
                     completedAt: Parse.iso(r.completed_at), completedBy: r.completed_by)
    }

    static func habits(_ rows: [HabitRow], logs: [HabitLogRow], memberIDs: [String]) -> [WHabit] {
        var byHabit: [String: [String: [String: LogEntry]]] = [:]
        for l in logs {
            let e = l.status == "done" ? LogEntry(status: .done, at: Parse.iso(l.done_at)) : LogEntry(status: .missed, at: nil)
            byHabit[l.habit_id, default: [:]][l.user_id, default: [:]][l.day] = e
        }
        return rows.map { r in
            let days = (r.schedule_days?.isEmpty == false && r.schedule_days!.count < 7) ? r.schedule_days!.sorted() : nil
            return WHabit(id: r.id, title: r.title, participants: r.is_shared ? memberIDs : (r.owner_id.map { [$0] } ?? []),
                          days: days, paused: r.paused, startDate: r.start_date, log: byHabit[r.id] ?? [:])
        }
    }

    static func members(_ rows: [MemberRow], profiles: [ProfileRow]) -> [Member] {
        let names = Dictionary(profiles.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
        return rows.sorted { a, b in a.role == b.role ? a.joined_at < b.joined_at : a.role == "owner" }
            .map { Member(id: $0.user_id, name: names[$0.user_id] ?? "Partner", role: $0.role) }
    }
}
