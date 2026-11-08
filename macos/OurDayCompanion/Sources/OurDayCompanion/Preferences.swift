import Foundation

/// Local cache of the person's notification preferences. The server row (`notification_preferences`) is the
/// source of truth across devices; this copy makes the app work offline and lets edits queue until they can sync.
enum PrefsStore {
    private static let key = "notificationPrefs"
    private static let dirtyKey = "notificationPrefsDirty"
    private static let seenKey = "seenPartnerAlerts"
    static var d: UserDefaults { .standard }

    static var prefs: NotificationPrefs {
        get {
            if let data = d.data(forKey: key), let p = try? JSONDecoder().decode(NotificationPrefs.self, from: data) { return p }
            // Migrate the old stand-alone toggle from Milestone 1 if present.
            var p = NotificationPrefs()
            if d.object(forKey: "autoShowBriefingOnUnlock") != nil { p.unlockBriefing = d.bool(forKey: "autoShowBriefingOnUnlock") }
            return p
        }
        set { d.set(try? JSONEncoder().encode(newValue), forKey: key) }
    }
    /// True while a local change has not reached the server yet (it wins over the server value until pushed).
    static var dirty: Bool { get { d.bool(forKey: dirtyKey) } set { d.set(newValue, forKey: dirtyKey) } }

    /// Partner rows already shown as OS alerts on this Mac (ids only, capped).
    static var seenAlerts: Set<String> {
        get { Set(d.stringArray(forKey: seenKey) ?? []) }
        set { d.set(Array(newValue.sorted().suffix(300)), forKey: seenKey) }
    }
}

/// Kept for the unlock code path: "Show briefing when Mac unlocks" is now a synced preference.
final class Preferences {
    static let shared = Preferences()
    var autoShowOnUnlock: Bool {
        get { PrefsStore.prefs.unlockBriefing }
        set { var p = PrefsStore.prefs; p.unlockBriefing = newValue; PrefsStore.prefs = p; PrefsStore.dirty = true }
    }
}
