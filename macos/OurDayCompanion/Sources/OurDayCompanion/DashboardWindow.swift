import AppKit
import WebKit

/// The full OurDay web app in a native window. The web app keeps its own Supabase session in this
/// web view's storage; the companion never sees credentials.
final class DashboardWindowController: NSObject, NSWindowDelegate {
    static let url = URL(string: "https://ourdayapp.vercel.app")!
    private var window: NSWindow?
    private var web: WKWebView?
    private var loadedAt = Date()
    /// The companion runs for days; the web view is created once. Re-validate with the server when the window comes back
    /// after this long, so a newly deployed OurDay (e.g. a new screen) is picked up without relaunching the companion.
    static let refreshAfter: TimeInterval = 5 * 60

    var isVisible: Bool { window?.isVisible == true }

    func show(path: String = "") {
        if window == nil {
            let cfg = WKWebViewConfiguration()
            cfg.websiteDataStore = .default()       // persistent: stays signed in across launches
            let wv = WKWebView(frame: .zero, configuration: cfg)
            wv.allowsBackForwardNavigationGestures = true
            wv.load(URLRequest(url: Self.url))
            loadedAt = Date()
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
                             styleMask: [.titled, .closable, .miniaturizable, .resizable],
                             backing: .buffered, defer: false)
            w.title = "OurDay"
            w.isReleasedWhenClosed = false
            w.contentView = wv
            w.setFrameAutosaveName("OurDayDashboard")
            w.center()
            w.delegate = self
            window = w; web = wv
        }
        else if path.isEmpty, Date().timeIntervalSince(loadedAt) > Self.refreshAfter {
            web?.reloadFromOrigin()
            loadedAt = Date()
            Log.info("dashboard reloaded from the server (open for a long time)")
        }
        if !path.isEmpty, let u = URL(string: path, relativeTo: Self.url) { web?.load(URLRequest(url: u.absoluteURL)); loadedAt = Date() }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Log.info("dashboard window shown\(path.isEmpty ? "" : " at \(path)")")
    }
}
