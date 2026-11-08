import AppKit
import SwiftUI

/// Form state lives in an ObservableObject: the @State macro's plugin ships only with full Xcode.
final class SignInForm: ObservableObject {
    @Published var email = ""
    @Published var password = ""
}

struct SignInView: View {
    @ObservedObject var model: CompanionModel
    @StateObject private var form = SignInForm()
    var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Sign in to OurDay").font(.title3.weight(.semibold))
            Text("Use the same email and password as the OurDay web app.").font(.callout).foregroundStyle(.secondary)
            if let note { Text(note).font(.callout).foregroundStyle(.orange) }
            TextField("Email", text: $form.email).textContentType(.username).textFieldStyle(.roundedBorder)
            SecureField("Password", text: $form.password).textContentType(.password).textFieldStyle(.roundedBorder).onSubmit(submit)
            if let e = model.signInError { Text(e).font(.callout).foregroundStyle(.red) }
            HStack {
                if model.phase == .signingIn { ProgressView().controlSize(.small) }
                Spacer()
                Button("Sign In", action: submit).buttonStyle(.borderedProminent).keyboardShortcut(.defaultAction)
                    .disabled(form.email.isEmpty || form.password.isEmpty || model.phase == .signingIn)
            }
        }
    }
    private func submit() {
        let e = form.email, p = form.password
        form.password = ""                                   // never keep the password around longer than the request
        Task { await model.signIn(email: e, password: p) }
    }
}

/// Owns exactly one briefing window for the lifetime of the app.
final class BriefingWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let model: CompanionModel
    private var lastShownUnlockID: UUID?
    var openDashboard: () -> Void = {}

    init(model: CompanionModel) { self.model = model }
    var isVisible: Bool { window?.isVisible == true }

    /// Shows (or raises) the single briefing window. A repeated call with the same unlockID is a no-op.
    /// Returns false when this unlock was already handled.
    @discardableResult
    func show(unlockID: UUID) -> Bool {
        if lastShownUnlockID == unlockID { Log.info("briefing already shown for \(unlockID.uuidString.prefix(8)); skipped"); return false }
        lastShownUnlockID = unlockID
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 880),
                             styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                             backing: .buffered, defer: false)
            w.title = "RANA Briefing"
            w.titlebarAppearsTransparent = true
            w.appearance = NSAppearance(named: .darkAqua)
            w.backgroundColor = NSColor(srgbRed: 17 / 255, green: 17 / 255, blue: 19 / 255, alpha: 1)
            w.titleVisibility = .hidden
            w.isMovableByWindowBackground = true
            w.minSize = NSSize(width: 760, height: 560)
            w.isReleasedWhenClosed = false
            w.delegate = self
            w.contentView = NSHostingView(rootView: BriefingRoot(model: model,
                openDashboard: { [weak self] in self?.openDashboard(); self?.window?.close() },
                dismiss: { [weak self] in self?.window?.close() }))
            w.center()
            window = w
        }
        window?.level = .floating
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Log.info("briefing window shown windowCount=\(NSApp.windows.filter { $0.title == "RANA Briefing" }.count)")
        return true
    }

    func windowWillClose(_ notification: Notification) { Log.info("briefing dismissed (app keeps running)") }
}
