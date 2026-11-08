import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let debug = CommandLine.arguments.contains("--debug")
    private lazy var monitor = UnlockMonitor(debug: debug)
    private lazy var model = CompanionModel()
    private lazy var briefing = BriefingWindowController(model: model)
    private let dashboard = DashboardWindowController()
    private lazy var centre = NotificationCentreController(model: model)
    private var statusItem: NSStatusItem!
    private let prefs = Preferences.shared

    func applicationDidFinishLaunching(_ notification: Notification) {
        BrandFonts.register()
        Log.info("launched (debug=\(debug)) log=\(Log.path)")
        briefing.openDashboard = { [weak self] in self?.dashboard.show() }

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let img = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "OurDay") { statusItem.button?.image = img }
        else { statusItem.button?.title = "OurDay" }
        let menu = NSMenu(); menu.delegate = self; statusItem.menu = menu

        if debug { installDebugHooks() }
        monitor.onUnlock = { [weak self] id in self?.handleUnlock(id) }
        monitor.start()
        centre.openDashboard = { [weak self] path in self?.dashboard.show(path: path) }
        model.onUnreadChange = { [weak self] n in
            self?.statusItem.button?.title = n > 0 ? " \(n)" : ""
            Log.info("unread badge = \(n)")
        }
        model.scheduler.setup()
        model.scheduler.onHabitAnswer = { [weak self] h, d, yes in await self?.model.answerHabit(habitID: h, day: d, done: yes) }
        model.scheduler.onOpen = { [weak self] in self?.centre.show() }
        Task { await model.restore(); await model.backgroundSync(reason: "launch") }
        startSyncTriggers()
    }

    /// Everything that should make the notification plan re-evaluate. Local notifications already scheduled keep
    /// firing without any of this; these only pick up changes made elsewhere and time/zone changes.
    private func startSyncTriggers() {
        Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { [weak self] _ in Task { @MainActor in await self?.model.backgroundSync(reason: "timer") } }
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in try? await Task.sleep(nanoseconds: 4_000_000_000); await self?.model.backgroundSync(reason: "wake") }   // let Wi-Fi come back
        }
        let nc = NotificationCenter.default
        nc.addObserver(forName: .NSSystemTimeZoneDidChange, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in await self?.model.backgroundSync(reason: "timezone change") } }
        nc.addObserver(forName: .NSCalendarDayChanged, object: nil, queue: .main) { [weak self] _ in Task { @MainActor in await self?.model.backgroundSync(reason: "new day") } }
    }

    nonisolated func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { dashboard.show() }
        return true
    }

    private func handleUnlock(_ id: UUID) {
        guard prefs.autoShowOnUnlock else { Log.info("unlock \(id.uuidString.prefix(8)): auto-show is OFF; nothing opened"); return }
        showBriefing(unlockID: id)       // never opens the dashboard automatically
    }

    private func showBriefing(unlockID: UUID) {
        guard briefing.show(unlockID: unlockID) else { return }
        Task { await model.loadBriefing() }
    }

    /// Debug-only hooks so tests can drive and inspect the app without Accessibility permission.
    private func installDebugHooks() {
        let dn = DistributedNotificationCenter.default()
        func on(_ name: String, _ f: @escaping @MainActor (Notification) -> Void) {
            dn.addObserver(forName: .init("com.ourday.companion.debug." + name), object: nil, queue: .main) { n in MainActor.assumeIsolated { f(n) } }
        }
        on("state") { [weak self] _ in
            guard let self else { return }
            let n = NSApp.windows.filter { $0.title == "RANA Briefing" && $0.isVisible }.count
            Log.info("STATE briefingWindowsVisible=\(n) dashboardVisible=\(self.dashboard.isVisible) autoShow=\(self.prefs.autoShowOnUnlock) phase=\(self.model.phase) cached=\(self.model.cachedSince != nil) signedIn=\(self.model.signedInEmail != nil) appearance=\(NSApp.effectiveAppearance.name.rawValue) loginItem=\(LoginItem.statusDescription)")
        }
        on("setAuto") { [weak self] n in self?.prefs.autoShowOnUnlock = (n.userInfo?["on"] as? String) == "1"; Log.info("auto-show on unlock set to \(self?.prefs.autoShowOnUnlock ?? false) [debug]") }
        on("setLogin") { n in LoginItem.set((n.userInfo?["on"] as? String) == "1") }
        on("network") { [weak self] n in
            let m = DebugTransport.Mode(rawValue: (n.userInfo?["mode"] as? String) ?? "normal") ?? .normal
            self?.model.transport.mode = m; Log.info("debug network mode = \(m.rawValue)")
        }
        on("expireToken") { [weak self] _ in Task { await self?.model.debugExpireToken(); Log.info("debug: access token expired/invalidated") } }
        on("signIn") { [weak self] n in   // debug only; used for the fake-credentials test
            guard let e = n.userInfo?["email"] as? String, let p = n.userInfo?["password"] as? String else { return }
            Task { await self?.model.signIn(email: e, password: p) }
        }
        on("corruptToken") { [weak self] _ in Task { await self?.model.debugCorruptToken(); Log.info("debug: access token corrupted (expiry unchanged)") } }
        on("pending") { [weak self] _ in Task { await self?.model.scheduler.debugList() } }
        on("delivered") { [weak self] _ in Task { await self?.model.scheduler.debugDelivered() } }
        on("testNotification") { [weak self] n in Task { await self?.model.scheduler.debugTest(in: Double(n.userInfo?["seconds"] as? String ?? "10") ?? 10) } }
        on("sync") { [weak self] _ in Task { await self?.model.backgroundSync(reason: "debug") } }
        on("load") { [weak self] n in let fresh = (n.userInfo?["session"] as? String) != "refresh"; Task { await self?.model.loadBriefing(newSession: fresh) } }
        on("setAppearance") { n in
            switch n.userInfo?["mode"] as? String { case "light": NSApp.appearance = NSAppearance(named: .aqua); case "dark": NSApp.appearance = NSAppearance(named: .darkAqua); default: NSApp.appearance = nil }
        }
        on("snapshot") { n in
            guard let path = n.userInfo?["path"] as? String, let view = NSApp.windows.first(where: { $0.title == "RANA Briefing" })?.contentView?.superview else { Log.info("snapshot: no window"); return }
            guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
            view.cacheDisplay(in: view.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
            Log.info("snapshot written (\(view.effectiveAppearance.name.rawValue))")
        }
    }

    // MARK: Menu (rebuilt each time it opens so states are current)
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        menu.addItem(item("Open RANA Briefing", #selector(openBriefing)))
        menu.addItem(item("Open OurDay Dashboard", #selector(openDashboard)))
        menu.addItem(.separator())
        if let email = model.signedInEmail {
            let who = NSMenuItem(title: "Signed in as \(email)", action: nil, keyEquivalent: ""); who.isEnabled = false
            menu.addItem(who)
            menu.addItem(item("Sign Out", #selector(signOut)))
        } else {
            menu.addItem(item("Sign In…", #selector(openBriefing)))
        }
        menu.addItem(.separator())
        let p = model.scheduler.prefs
        let unread = CentreRules.unread(model.centre)
        menu.addItem(item(unread > 0 ? "Notification Centre (\(unread) unread)…" : "Notification Centre…", #selector(openCentre)))
        let nm = item("Notifications", #selector(toggleNotifMaster)); nm.state = p.master ? .on : .off; menu.addItem(nm)
        let nd = item("   Deadline reminders", #selector(toggleNotifDeadlines)); nd.state = p.deadlines ? .on : .off; nd.isEnabled = p.master; menu.addItem(nd)
        let nh = item("   Habit check-ins (9:30 PM)", #selector(toggleNotifHabits)); nh.state = p.habits ? .on : .off; nh.isEnabled = p.master; menu.addItem(nh)
        let np = item("   Partner activity", #selector(toggleNotifPartner)); np.state = p.partner ? .on : .off; np.isEnabled = p.master; menu.addItem(np)
        if model.scheduler.authorization == .denied { menu.addItem(item("⚠︎ Notifications are blocked — open System Settings…", #selector(openNotifSettings))) }
        menu.addItem(.separator())
        let auto = item("Show briefing when Mac unlocks", #selector(toggleAuto)); auto.state = p.unlockBriefing ? .on : .off
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
    @objc private func openBriefing() { showBriefing(unlockID: UUID()) }
    @objc private func openDashboard() { dashboard.show() }
    @objc private func signOut() { Task { await model.signOut() } }
    private func changePrefs(_ f: @escaping (inout NotificationPrefs) -> Void) { Task { await model.changePrefs(f) } }
    @objc private func openCentre() { centre.show() }
    @objc private func toggleNotifMaster() { changePrefs { $0.master.toggle() } }
    @objc private func toggleNotifDeadlines() { changePrefs { $0.deadlines.toggle() } }
    @objc private func toggleNotifHabits() { changePrefs { $0.habits.toggle() } }
    @objc private func toggleNotifPartner() { changePrefs { $0.partner.toggle() } }
    @objc private func openNotifSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!) }
    @objc private func toggleAuto() { changePrefs { $0.unlockBriefing.toggle() } }
    @objc private func toggleLogin() { LoginItem.set(!LoginItem.isEnabled) }
    @objc private func simulate() { monitor.simulateUnlockCycle() }
    @objc private func quit() { NSApp.terminate(nil) }
}
