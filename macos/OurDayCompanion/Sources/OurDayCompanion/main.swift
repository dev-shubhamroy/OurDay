import AppKit

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)   // menu-bar app: no Dock icon; windows still work
    withExtendedLifetime(delegate) { app.run() }
}
