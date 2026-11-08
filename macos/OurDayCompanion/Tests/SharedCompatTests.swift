import Foundation

// The Mac companion predates Shared Tasks. These checks prove it ignores them safely (no crash, no wrong alerts) and still
// decodes the extra notification rows; Shared Tasks themselves are used from the OurDay web app.
func runSharedCompatTests() {
    let shared = TaskRow(id: "s1", kind: "shared", title: "Plan trip", notes: nil, created_by: "me", notify_second_user: true,
                         task_date: "2026-11-09", planned_time: nil, due_at: nil, status: "open", completed_at: nil, completed_by: nil, created_at: "2026-11-09T08:00:00Z")
    check(Mapper.task(shared, ist) == nil, "a shared task is skipped by the Mac mapper (not mis-read as a personal task)")
    var withDeadline = shared; withDeadline.due_at = "2026-11-10T10:00:00Z"
    check(Mapper.task(withDeadline, ist) == nil, "a shared task with a deadline is skipped too")
    let personal = TaskRow(id: "d1", kind: "daily", title: "Mine", notes: nil, created_by: "me", notify_second_user: false,
                           task_date: "2026-11-09", planned_time: nil, due_at: nil, status: "open", completed_at: nil, completed_by: nil, created_at: "2026-11-09T08:00:00Z")
    check(Mapper.task(personal, ist)?.id == "d1", "personal tasks still map")
    let json = #"{"id":"r1","kind":"partner","title":"Riya reminded you","body":"“Hey”\nPlan trip","task_id":"s1","habit_id":null,"actor_id":"p","occurred_at":"2026-11-09T10:00:00Z","read_at":null,"subtype":"reminder","expires_at":"2026-11-10T10:00:00Z"}"#
    let n = try? JSONDecoder().decode(NotificationRow.self, from: Data(json.utf8))
    check(n?.title == "Riya reminded you" && n?.kind == "partner", "a shared-task notification row (extra columns) still decodes")
}
