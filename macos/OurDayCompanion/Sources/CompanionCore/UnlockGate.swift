import Foundation

/// Raw signals the Mac can give us. Which of these actually arrive is checked on a real Mac,
/// see OURDAY_SPEC.md → "macOS companion".
public enum SessionSignal: Equatable {
    case screenLocked
    case screenUnlocked
    case systemWillSleep
    case systemDidWake
    case sessionResigned   // fast user switching away
    case sessionBecameActive
}

public enum GateDecision: Equatable {
    case fire(unlockID: UUID)
    case ignored(reason: String)
}

/// Turns noisy lock/unlock/sleep signals into at most one "unlock" per real lock→unlock transition.
///
/// Rules
///  * An unlock only counts if the screen was seen locked since the last accepted unlock.
///  * Repeated unlock signals (macOS posts several) are ignored until a new lock happens.
///  * An unlock within `minInterval` of the last accepted one is ignored (belt and braces).
///  * Sleep/wake alone never fire: waking without a lock screen is not an unlock.
///  * If the Mac sleeps while locked, the lock stays pending until a real unlock arrives.
public struct UnlockGate {
    public private(set) var lockedSinceLastUnlock: Bool
    public private(set) var lastFire: Date?
    public let minInterval: TimeInterval

    public init(startLocked: Bool = false, minInterval: TimeInterval = 5) {
        self.lockedSinceLastUnlock = startLocked
        self.minInterval = minInterval
    }

    public mutating func handle(_ signal: SessionSignal, at now: Date, newID: () -> UUID = UUID.init) -> GateDecision {
        switch signal {
        case .screenLocked:
            lockedSinceLastUnlock = true
            return .ignored(reason: "lock recorded")
        case .screenUnlocked:
            guard lockedSinceLastUnlock else { return .ignored(reason: "duplicate unlock (no lock since last unlock)") }
            if let last = lastFire, now.timeIntervalSince(last) < minInterval {
                lockedSinceLastUnlock = false
                return .ignored(reason: "unlock within \(Int(minInterval))s of previous")
            }
            lockedSinceLastUnlock = false
            lastFire = now
            return .fire(unlockID: newID())
        case .systemWillSleep, .systemDidWake, .sessionResigned, .sessionBecameActive:
            return .ignored(reason: "\(signal) is informational")
        }
    }
}
