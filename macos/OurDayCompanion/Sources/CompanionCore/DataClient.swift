import Foundation

/// Reads the signed-in member's data through PostgREST. Row Level Security scopes everything to
/// their own workspace; this client only ever holds the member's own JWT and the publishable key.
struct DataClient {
    let config: SupabaseConfig
    let transport: HTTPTransport
    let coordinator: SessionCoordinator
    var pageSize = 1000

    private func get(_ path: String, token: String) async throws -> Data {
        var r = URLRequest(url: URL(string: config.url.absoluteString + "/rest/v1/" + path)!)
        r.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp): (Data, HTTPURLResponse)
        do { (data, resp) = try await transport.send(r) } catch { throw classify(error) }
        switch resp.statusCode {
        case 200...299: return data
        case 401: throw AppError.unauthorized
        default: throw AppError.server(resp.statusCode)
        }
    }

    /// One authenticated request; on 401 refresh once and retry.
    private func authed(_ path: String) async throws -> Data {
        let token = try await coordinator.accessToken()
        do { return try await get(path, token: token) }
        catch AppError.unauthorized {
            let fresh = try await coordinator.forceRefresh()
            do { return try await get(path, token: fresh) }
            catch AppError.unauthorized { throw AppError.sessionExpired }
        }
    }

    private func all<T: Decodable>(_ table: String, select: String, order: String) async throws -> [T] {
        var rows: [T] = []
        var offset = 0
        while true {
            let data = try await authed("\(table)?select=\(select)&order=\(order).asc&limit=\(pageSize)&offset=\(offset)")
            guard let batch = try? JSONDecoder().decode([T].self, from: data) else { throw AppError.decoding }
            rows += batch
            if batch.count < pageSize { return rows }
            offset += pageSize
        }
    }

    func fetchSnapshot(userID: String, calendar: Calendar, now: Date) async throws -> DataSnapshot {
        let memberRows: [MemberRow] = try await all("workspace_members", select: "user_id,role,joined_at", order: "joined_at")
        guard !memberRows.isEmpty else { throw AppError.noWorkspace }
        let ids = memberRows.map(\.user_id).joined(separator: ",")
        async let profilesReq: [ProfileRow] = all("profiles", select: "id,name", order: "created_at").filteredIDs(ids)
        async let tasksReq: [TaskRow] = all("tasks", select: "id,kind,title,notes,created_by,notify_second_user,task_date,planned_time,due_at,status,completed_at,completed_by,created_at", order: "created_at")
        async let habitsReq: [HabitRow] = all("habits", select: "id,title,created_by,is_shared,owner_id,schedule_days,paused,start_date", order: "created_at")
        async let logsReq: [HabitLogRow] = all("habit_logs", select: "habit_id,user_id,day,status,done_at", order: "day")
        let (profiles, tasks, habits, logs) = try await (profilesReq, tasksReq, habitsReq, logsReq)
        let members = Mapper.members(memberRows, profiles: profiles)
        return DataSnapshot(meID: userID, members: members,
                            tasks: tasks.compactMap { Mapper.task($0, calendar) },
                            habits: Mapper.habits(habits, logs: logs, memberIDs: members.map(\.id)),
                            fetchedAt: now)
    }
}

private extension Array where Element == ProfileRow {
    /// RLS already limits profiles to workspace members; this just drops anything unexpected.
    func filteredIDs(_ ids: String) -> [ProfileRow] { let set = Set(ids.split(separator: ",").map(String.init)); return filter { set.contains($0.id) } }
}
