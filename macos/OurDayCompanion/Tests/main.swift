// Minimal dependency-free test runner. XCTest/SwiftPM are unavailable with only the Command Line
// Tools installed, so scripts/test.sh compiles CompanionCore + this file with swiftc and runs it.
import Foundation

var failures = 0
var checks = 0
func check(_ cond: @autoclosure () -> Bool, _ name: String, line: Int = #line) {
    checks += 1
    if !cond() { failures += 1; print("FAIL (line \(line)): \(name)") }
}
func isFire(_ d: GateDecision) -> Bool { if case .fire = d { return true }; return false }

let t0 = Date(timeIntervalSince1970: 1_000_000)

do { // lock then unlock fires once, duplicates ignored
    var g = UnlockGate()
    _ = g.handle(.screenLocked, at: t0)
    check(isFire(g.handle(.screenUnlocked, at: t0 + 10)), "first unlock fires")
    check(!isFire(g.handle(.screenUnlocked, at: t0 + 11)), "duplicate 1 ignored")
    check(!isFire(g.handle(.screenUnlocked, at: t0 + 12)), "duplicate 2 ignored")
}
do { var g = UnlockGate(); check(!isFire(g.handle(.screenUnlocked, at: t0)), "unlock without lock ignored") }
do {
    var g = UnlockGate()
    for s in [SessionSignal.systemWillSleep, .systemDidWake, .sessionResigned, .sessionBecameActive] {
        check(!isFire(g.handle(s, at: t0)), "\(s) never fires")
    }
}
do { // sleep while locked
    var g = UnlockGate()
    _ = g.handle(.screenLocked, at: t0); _ = g.handle(.systemWillSleep, at: t0 + 1); _ = g.handle(.systemDidWake, at: t0 + 3600)
    check(isFire(g.handle(.screenUnlocked, at: t0 + 3610)), "unlock after sleep-while-locked fires")
}
do { // second real cycle
    var g = UnlockGate()
    _ = g.handle(.screenLocked, at: t0); _ = g.handle(.screenUnlocked, at: t0 + 10)
    _ = g.handle(.screenLocked, at: t0 + 100)
    check(isFire(g.handle(.screenUnlocked, at: t0 + 110)), "second cycle fires")
}
do { // rapid cycle
    var g = UnlockGate(minInterval: 5)
    _ = g.handle(.screenLocked, at: t0); _ = g.handle(.screenUnlocked, at: t0 + 10)
    _ = g.handle(.screenLocked, at: t0 + 11)
    check(!isFire(g.handle(.screenUnlocked, at: t0 + 12)), "unlock within 5s ignored")
    _ = g.handle(.screenLocked, at: t0 + 20)
    check(isFire(g.handle(.screenUnlocked, at: t0 + 30)), "later cycle fires again")
}
do { var g = UnlockGate(startLocked: true); check(isFire(g.handle(.screenUnlocked, at: t0)), "start locked fires") }

do { // briefing day
    var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Asia/Kolkata")!
    check(BriefingDay.kind(lastBriefingDay: nil, now: Date()) == .full, "nil → full")
    let k = BriefingDay.key(for: Date()); check(BriefingDay.kind(lastBriefingDay: k, now: Date()) == .update, "same day → update")
    let f = ISO8601DateFormatter()
    let a = f.date(from: "2026-11-08T18:00:00Z")!, b = f.date(from: "2026-11-08T18:40:00Z")!
    check(BriefingDay.key(for: a, calendar: c) == "2026-11-08", "IST key a")
    check(BriefingDay.key(for: b, calendar: c) == "2026-11-09", "IST key b crosses local midnight")
    check(BriefingDay.kind(lastBriefingDay: "2026-11-08", now: b, calendar: c) == .full, "new local day → full")
}

let done = DispatchSemaphore(value: 0)
Task.detached { await runAuthTests(); await runDataTests(); runEngineTests(); runReportTests(); runQuoteTests(); runNotificationTests(); await runCentreTests(); done.signal() }
done.wait()
print("\(checks - failures)/\(checks) checks passed")
exit(failures == 0 ? 0 : 1)
