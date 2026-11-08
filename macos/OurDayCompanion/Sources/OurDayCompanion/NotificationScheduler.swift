import Foundation
import UserNotifications

/// Turns the pure plan into real OS-scheduled notifications. Requests are handed to macOS, which delivers them
/// even when this app is not running (for anything scheduled before it quit). Preferences live in UserDefaults
/// for now; syncing them between devices needs a table that has not been approved yet.
@MainActor
final class NotificationScheduler: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private let prefsKey = "notificationPrefs"
    private(set) var authorization: UNAuthorizationStatus = .notDetermined

    var onHabitAnswer: ((String, String, Bool) async -> Void)?
    var onOpen: (() -> Void)?

    var prefs: NotificationPrefs {
        get { PrefsStore.prefs }
        set { PrefsStore.prefs = newValue }
    }

    func setup() {
        center.delegate = self
        let yes = UNNotificationAction(identifier: "OURDAY_YES", title: "Yes, done", options: [])
        let no = UNNotificationAction(identifier: "OURDAY_NO", title: "No", options: [])
        center.setNotificationCategories([UNNotificationCategory(identifier: NotificationPlanner.habitCategory, actions: [yes, no], intentIdentifiers: [], options: [])])
    }

    /// Asks once (system prompt) if undecided; never nags after a denial.
    @discardableResult
    func ensureAuthorization() async -> Bool {
        var s = await center.notificationSettings()
        if s.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            s = await center.notificationSettings()
        }
        authorization = s.authorizationStatus
        return authorization == .authorized || authorization == .provisional
    }

    var statusText: String {
        switch authorization {
        case .authorized, .provisional: return "allowed"
        case .denied: return "blocked in System Settings"
        case .notDetermined: return "not requested yet"
        default: return "unknown"
        }
    }

    // MARK: Reconcile

    func apply(_ snapshot: DataSnapshot) async {
        let cal = Calendar.autoupdatingCurrent, now = Date()
        guard await ensureAuthorization() else {
            Log.info("notifications not scheduled: permission \(statusText)")
            return
        }
        let plan = NotificationPlanner.plan(snapshot, now: now, cal, prefs: prefs)
        let pendingReqs = await center.pendingNotificationRequests()
        var pending: [String: String] = [:]
        for r in pendingReqs where r.identifier.hasPrefix(NotificationPlanner.managedPrefix) { pending[r.identifier] = (r.content.userInfo["sig"] as? String) ?? "" }
        let diff = NotificationPlanner.diff(pending: pending, plan: plan)
        if !diff.remove.isEmpty { center.removePendingNotificationRequests(withIdentifiers: diff.remove) }
        for p in diff.add { await schedule(p, cal) }

        // Remove notifications already sitting in Notification Centre for deadlines that were since completed/deleted/changed.
        let delivered = await center.deliveredNotifications()
        let items = delivered.map { (id: $0.request.identifier, info: Dictionary(uniqueKeysWithValues: $0.request.content.userInfo.compactMap { k, v in (k as? String).flatMap { key in (v as? String).map { (key, $0) } } })) }
        let stale = NotificationPlanner.staleDeliveredDeadlineIDs(delivered: items, snapshot, now: now)
        if !stale.isEmpty { center.removeDeliveredNotifications(withIdentifiers: stale) }
        Log.info("notifications reconciled: planned=\(plan.count) added=\(diff.add.count) removed=\(diff.remove.count) unchanged=\(plan.count - diff.add.count) staleDeliveredRemoved=\(stale.count) permission=\(statusText)")
    }

    private func schedule(_ p: PlannedNotification, _ cal: Calendar) async {
        let c = UNMutableNotificationContent()
        c.title = p.title; c.body = p.body; c.sound = .default; c.threadIdentifier = p.threadID
        if let cat = p.category { c.categoryIdentifier = cat }
        var info: [String: Any] = p.userInfo; info["sig"] = p.signature; c.userInfo = info
        var comps = cal.dateComponents(in: cal.timeZone, from: p.fireDate)
        let units: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        var dc = DateComponents()
        for u in units { dc.setValue(comps.value(for: u), for: u) }
        if p.absolute { dc.timeZone = cal.timeZone }   // pinned to the instant, immune to later timezone changes
        _ = comps; comps = dc
        let req = UNNotificationRequest(identifier: p.id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: dc, repeats: false))
        do { try await center.add(req) } catch { Log.info("schedule failed for \(p.id.prefix(24))…: \(error.localizedDescription)") }
    }

    /// Sign-out: nothing of this account's should keep firing.
    func clearAll() async {
        let pend = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(NotificationPlanner.managedPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pend)
        let del = await center.deliveredNotifications().map(\.request.identifier).filter { $0.hasPrefix(NotificationPlanner.managedPrefix) }
        center.removeDeliveredNotifications(withIdentifiers: del)
        Log.info("notifications cleared (pending \(pend.count), delivered \(del.count))")
    }

    /// Immediate OS alert for partner activity (needs this Mac to be online and the companion running).
    func postAlert(id: String, title: String, body: String) async {
        guard await ensureAuthorization() else { return }
        let c = UNMutableNotificationContent(); c.title = title; c.body = body; c.sound = .default; c.threadIdentifier = "partner"
        try? await center.add(UNNotificationRequest(identifier: "ourday-alert.\(id)", content: c, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)))
    }

    func notifyFailure(_ text: String) async {
        let c = UNMutableNotificationContent(); c.title = "OurDay"; c.body = text; c.sound = .default
        try? await center.add(UNNotificationRequest(identifier: "ourday.msg.\(UUID().uuidString)", content: c, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)))
    }

    // MARK: Debug

    func debugList() async {
        let reqs = await center.pendingNotificationRequests().filter { $0.identifier.hasPrefix(NotificationPlanner.managedPrefix) }
        let f = ISO8601DateFormatter(); f.timeZone = .current
        let rows = reqs.compactMap { r -> (Date, String)? in
            guard let t = r.trigger as? UNCalendarNotificationTrigger, let d = t.nextTriggerDate() else { return nil }
            let parts = r.identifier.split(separator: ".")
            return (d, "\(parts[1]):\(String(parts[2]).prefix(6)):\(parts.last ?? "")")
        }.sorted { $0.0 < $1.0 }
        Log.info("PENDING total=\(reqs.count) deadline=\(reqs.filter { $0.identifier.contains(".dl.") }.count) habit=\(reqs.filter { $0.identifier.contains(".hb.") }.count)")
        for r in rows.prefix(14) { Log.info("  \(f.string(from: r.0)) \(r.1)") }
        Log.info("permission=\(statusText)")
    }

    func debugTest(in seconds: Double) async {
        guard await ensureAuthorization() else { Log.info("test notification: permission \(statusText)"); return }
        let fire = Date().addingTimeInterval(seconds)
        await schedule(PlannedNotification(id: "ourday.test.\(UUID().uuidString)", fireDate: fire, title: "OurDay test", body: "Scheduled \(Int(seconds))s ahead with an absolute calendar trigger.", kind: .deadline, threadID: "test", userInfo: ["kind": "test"], absolute: true, category: nil), Calendar.autoupdatingCurrent)
        Log.info("test notification scheduled for \(ISO8601DateFormatter().string(from: fire))")
    }

    func debugDelivered() async {
        let d = await center.deliveredNotifications()
        Log.info("DELIVERED count=\(d.count) ids=\(d.map { String($0.request.identifier.prefix(22)) })")
    }

    // MARK: UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]            // show even while the companion is the active app; Focus still applies
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let action = response.actionIdentifier
        let habit = info["habitId"] as? String, day = info["day"] as? String
        await MainActor.run {
            Log.info("notification response action=\(action)")
            if action == "OURDAY_YES" || action == "OURDAY_NO", let habit, let day {
                Task { await self.onHabitAnswer?(habit, day, action == "OURDAY_YES") }
            } else if action == UNNotificationDefaultActionIdentifier { self.onOpen?() }
        }
    }
}
