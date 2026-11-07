import AppKit
import WebKit

/// The full OurDay web app in a native window. The web app keeps its own Supabase session in this
/// web view's storage; the companion never sees credentials.
final class DashboardWindowController: NSObject, NSWindowDelegate {
    static let url = URL(string: "https://ourdayapp.vercel.app")!
    private var window: NSWindow?
    private var web: WKWebView?

    var isVisible: Bool { window?.isVisible == true }

    func show() {
        if window == nil {
            let cfg = WKWebViewConfiguration()
            cfg.websiteDataStore = .default()       // persistent: stays signed in across launches
            let wv = WKWebView(frame: .zero, configuration: cfg)
            wv.allowsBackForwardNavigationGestures = true
            wv.load(URLRequest(url: Self.url))
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
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Log.info("dashboard window shown")
    }
}
