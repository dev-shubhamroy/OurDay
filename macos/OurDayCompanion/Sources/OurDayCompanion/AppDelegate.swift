import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let debug = CommandLine.arguments.contains("--debug")
    private lazy var monitor = UnlockMonitor(debug: debug)
    private let briefing = BriefingWindowController()
    private let dashboard = DashboardWindowController()
    private var statusItem: NSStatusItem!
    private let prefs = Preferences.shared

    func applicationDidFinishLaunching(_ notification: Notification) {
        Log.info("launched (debug=\(debug)) log=\(Log.path)")
        briefing.openDashboard = { [weak self] in self?.dashboard.show() }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "OurDay")
        let menu = NSMenu(); menu.delegate = self; statusItem.menu = menu

        monitor.onUnlock = { [weak self] id in self?.handleUnlock(id) }
        monitor.start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    // Clicking the app icon again (e.g. from Finder) shows the dashboard instead of doing nothing.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { dashboard.show() }
        return true
    }

    private func handleUnlock(_ id: UUID) {
        guard prefs.autoShowOnUnlock else { Log.info("unlock \(id.uuidString.prefix(8)): auto-show is OFF; nothing opened"); return }
        let now = Date()
        let kind = BriefingDay.kind(lastBriefingDay: prefs.lastBriefingDay, now: now)
        prefs.lastBriefingDay = BriefingDay.key(for: now)
        briefing.show(kind: kind, unlockID: id)       // never opens the dashboard automatically
    }

    // MARK: Menu (rebuilt each time it opens so states are current)
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        menu.addItem(item("Open RANA Briefing", #selector(openBriefing)))
        menu.addItem(item("Open OurDay Dashboard", #selector(openDashboard)))
        menu.addItem(.separator())
        let auto = item("Show briefing when Mac unlocks", #selector(toggleAuto)); auto.state = prefs.autoShowOnUnlock ? .on : .off
        menu.addItem(auto)
        let login = item("Launch at login", #selector(toggleLogin)); login.state = LoginItem.isEnabled ? .on : .off
        menu.addItem(login)
        if debug { menu.addItem(.separator()); menu.addItem(item("Simulate unlock (debug)", #selector(simulate))) }
        menu.addItem(.separator())
        menu.addItem(item("Quit OurDay Companion", #selector(quit), key: "q"))
    }
    private func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.target = self; return i
    }
    @objc private func openBriefing() {
        let kind = BriefingDay.kind(lastBriefingDay: prefs.lastBriefingDay, now: Date())
        briefing.show(kind: kind, unlockID: UUID())
    }
    @objc private func openDashboard() { dashboard.show() }
    @objc private func toggleAuto() { prefs.autoShowOnUnlock.toggle(); Log.info("auto-show on unlock = \(prefs.autoShowOnUnlock)") }
    @objc private func toggleLogin() { LoginItem.set(!LoginItem.isEnabled) }
    @objc private func simulate() { monitor.simulateUnlockCycle() }
    @objc private func quit() { NSApp.terminate(nil) }
}
