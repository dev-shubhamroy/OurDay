import AppKit

/// Feeds raw macOS signals into `UnlockGate` and reports de-duplicated unlocks.
///
/// Signal sources:
///  * `com.apple.screenIsLocked` / `com.apple.screenIsUnlocked` on DistributedNotificationCenter.
///    These are long-standing but NOT formally documented by Apple; there is no public, documented
///    "screen unlocked" API. Verified on this Mac (see spec). They are the standard approach.
///  * NSWorkspace sleep/wake and session notifications (documented) for logging and state tracking.
///  * `CGSessionCopyCurrentDictionary()["CGSSessionScreenIsLocked"]` to read the real current state
///    at launch (so a companion started while locked still works).
final class UnlockMonitor {
    var onUnlock: ((UUID) -> Void)?
    private var gate: UnlockGate
    private let debug: Bool

    init(debug: Bool) {
        self.debug = debug
        self.gate = UnlockGate(startLocked: UnlockMonitor.screenIsLockedNow())
    }

    static func screenIsLockedNow() -> Bool {
        guard let dict = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
        return (dict["CGSSessionScreenIsLocked"] as? Bool) ?? ((dict["CGSSessionScreenIsLocked"] as? Int) == 1)
    }

    func start() {
        let dn = DistributedNotificationCenter.default()
        dn.addObserver(self, selector: #selector(locked), name: .init("com.apple.screenIsLocked"), object: nil)
        dn.addObserver(self, selector: #selector(unlocked), name: .init("com.apple.screenIsUnlocked"), object: nil)

        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        ws.addObserver(self, selector: #selector(resigned), name: NSWorkspace.sessionDidResignActiveNotification, object: nil)
        ws.addObserver(self, selector: #selector(became), name: NSWorkspace.sessionDidBecomeActiveNotification, object: nil)

        if debug {
            // Lets tests inject signals; only active with --debug.
            dn.addObserver(self, selector: #selector(debugLock), name: .init("com.ourday.companion.debug.lock"), object: nil)
            dn.addObserver(self, selector: #selector(debugUnlock), name: .init("com.ourday.companion.debug.unlock"), object: nil)
        }
        Log.info("monitor started; screen locked now = \(UnlockMonitor.screenIsLockedNow()); gate startLocked = \(gate.lockedSinceLastUnlock)")
    }

    private func feed(_ s: SessionSignal, source: String) {
        let decision = gate.handle(s, at: Date())
        switch decision {
        case .fire(let id):
            Log.info("signal \(s) [\(source)] → UNLOCK accepted \(id.uuidString.prefix(8))")
            DispatchQueue.main.async { self.onUnlock?(id) }
        case .ignored(let reason):
            Log.info("signal \(s) [\(source)] → ignored: \(reason)")
        }
    }

    @objc private func locked() { feed(.screenLocked, source: "system") }
    @objc private func unlocked() { feed(.screenUnlocked, source: "system") }
    @objc private func willSleep() { feed(.systemWillSleep, source: "system") }
    @objc private func didWake() { feed(.systemDidWake, source: "system") }
    @objc private func resigned() { feed(.sessionResigned, source: "system") }
    @objc private func became() { feed(.sessionBecameActive, source: "system") }
    @objc private func debugLock() { feed(.screenLocked, source: "debug") }
    @objc private func debugUnlock() { feed(.screenUnlocked, source: "debug") }

    /// Menu "Simulate unlock" (debug builds only): a full lock → unlock cycle.
    func simulateUnlockCycle() { feed(.screenLocked, source: "debug"); feed(.screenUnlocked, source: "debug") }
}
