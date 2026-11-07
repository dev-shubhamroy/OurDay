import Foundation

/// Only non-sensitive state lives here: a toggle and the last briefing day.
final class Preferences {
    static let shared = Preferences()
    private let d = UserDefaults.standard
    private enum K { static let auto = "autoShowBriefingOnUnlock" }

    /// "Show RANA briefing when my Mac unlocks". Turning this off never affects notifications.
    var autoShowOnUnlock: Bool {
        get { d.object(forKey: K.auto) == nil ? true : d.bool(forKey: K.auto) }
        set { d.set(newValue, forKey: K.auto) }
    }
}
