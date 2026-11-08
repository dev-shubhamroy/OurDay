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
        let memberRows: [MemberRow] = try await all("workspace_members", select: "user_id,role,joined_at,workspace_id", order: "joined_at")
        guard !memberRows.isEmpty else { throw AppError.noWorkspace }
        let ids = memberRows.map(\.user_id).joined(separator: ",")
        async let profilesReq: [ProfileRow] = all("profiles", select: "id,name", order: "created_at").filteredIDs(ids)
        async let tasksReq: [TaskRow] = all("tasks", select: "id,kind,title,notes,created_by,notify_second_user,task_date,planned_time,due_at,status,completed_at,completed_by,created_at", order: "created_at")
        async let habitsReq: [HabitRow] = all("habits", select: "id,title,created_by,is_shared,owner_id,schedule_days,paused,start_date,notify_second_user", order: "created_at")
        async let logsReq: [HabitLogRow] = all("habit_logs", select: "habit_id,user_id,day,status,done_at", order: "day")
        let (profiles, tasks, habits, logs) = try await (profilesReq, tasksReq, habitsReq, logsReq)
        let members = Mapper.members(memberRows, profiles: profiles)
        return DataSnapshot(meID: userID, workspaceID: memberRows.first?.workspace_id, members: members,
                            tasks: tasks.compactMap { Mapper.task($0, calendar) },
                            habits: Mapper.habits(habits, logs: logs, memberIDs: members.map(\.id)),
                            fetchedAt: now)
    }
}

private extension Array where Element == ProfileRow {
    /// RLS already limits profiles to workspace members; this just drops anything unexpected.
    func filteredIDs(_ ids: String) -> [ProfileRow] { let set = Set(ids.split(separator: ",").map(String.init)); return filter { set.contains($0.id) } }
}

// MARK: Habit check-in writes (same rows and RLS as the web app: your own log, one row per habit/person/day)

extension DataClient {
    private func send(_ method: String, _ path: String, body: Data? = nil, prefer: String? = nil) async throws -> Data {
        func once(_ token: String) async throws -> Data {
            var r = URLRequest(url: URL(string: config.url.absoluteString + "/rest/v1/" + path)!)
            r.httpMethod = method
            r.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let prefer { r.setValue(prefer, forHTTPHeaderField: "Prefer") }
            r.httpBody = body
            let (d, resp): (Data, HTTPURLResponse)
            do { (d, resp) = try await transport.send(r) } catch { throw classify(error) }
            switch resp.statusCode {
            case 200...299: return d
            case 401: throw AppError.unauthorized
            case 404: throw AppError.backendUnavailable
            default: throw AppError.server(resp.statusCode)
            }
        }
        let token = try await coordinator.accessToken()
        do { return try await once(token) }
        catch AppError.unauthorized {
            let fresh = try await coordinator.forceRefresh()
            do { return try await once(fresh) } catch AppError.unauthorized { throw AppError.sessionExpired }
        }
    }

    /// The signed-in user's current log status for one habit/day, read fresh from the server.
    func currentHabitLog(habitID: String, userID: String, day: String) async throws -> String? {
        let d = try await send("GET", "habit_logs?select=status&habit_id=eq.\(habitID)&user_id=eq.\(userID)&day=eq.\(day)&limit=1")
        struct R: Decodable { var status: String }
        return (try? JSONDecoder().decode([R].self, from: d))?.first?.status
    }

    /// Upserts YOUR OWN log (user_id is always the signed-in user; RLS enforces it too). One row per habit/person/day: no duplicates.
    func writeHabitLog(habitID: String, userID: String, workspaceID: String, day: String, status: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["habit_id": habitID, "user_id": userID, "workspace_id": workspaceID, "day": day, "status": status])
        _ = try await send("POST", "habit_logs?on_conflict=habit_id,user_id,day", body: body, prefer: "resolution=merge-duplicates,return=minimal")
    }
}

// MARK: Notification centre + synced preferences

extension DataClient {
    /// Asks the database to create this person's due reminders (idempotent). Throws .backendUnavailable if not deployed.
    func generateMyNotifications() async throws {
        _ = try await send("POST", "rpc/generate_my_notifications", body: Data("{}".utf8))
    }

    func fetchNotifications(limit: Int = 100) async throws -> [NotificationRow] {
        let d = try await send("GET", "notifications?select=id,kind,title,body,task_id,habit_id,actor_id,occurred_at,read_at&order=occurred_at.desc&limit=\(limit)")
        guard let rows = try? JSONDecoder().decode([NotificationRow].self, from: d) else { throw AppError.decoding }
        return rows
    }

    func markRead(ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        let list = ids.joined(separator: ",")
        _ = try await send("PATCH", "notifications?id=in.(\(list))&read_at=is.null", body: Data(#"{"read_at":"\#(ISO8601DateFormatter().string(from: Date()))"}"#.utf8), prefer: "return=minimal")
    }

    func markAllRead(userID: String) async throws {
        _ = try await send("PATCH", "notifications?user_id=eq.\(userID)&read_at=is.null", body: Data(#"{"read_at":"\#(ISO8601DateFormatter().string(from: Date()))"}"#.utf8), prefer: "return=minimal")
    }

    func fetchPrefs(userID: String) async throws -> PrefsRow? {
        let d = try await send("GET", "notification_preferences?select=master,deadlines,habits,partner,unlock_briefing,timezone&user_id=eq.\(userID)&limit=1")
        return (try? JSONDecoder().decode([PrefsRow].self, from: d))?.first
    }

    func savePrefs(userID: String, _ row: PrefsRow) async throws {
        var obj = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(row))) as? [String: Any] ?? [:]
        obj["user_id"] = userID
        _ = try await send("POST", "notification_preferences?on_conflict=user_id", body: try JSONSerialization.data(withJSONObject: obj), prefer: "resolution=merge-duplicates,return=minimal")
    }
}
