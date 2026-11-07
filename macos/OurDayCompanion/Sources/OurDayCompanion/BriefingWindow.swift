import AppKit
import SwiftUI

final class BriefingModel: ObservableObject {
    @Published var kind: BriefingKind = .full
    @Published var shownAt = Date()
    @Published var unlockID = UUID()
}

struct BriefingView: View {
    @ObservedObject var model: BriefingModel
    var openDashboard: () -> Void
    var dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles").font(.title2).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text("RANA").font(.title3.weight(.semibold))
                    Text(model.kind == .full ? "Your daily briefing" : "Quick update since your last briefing")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
            }
            Divider()
            // Milestone 2 replaces this with the deterministic RANA briefing built from the user's Supabase data.
            VStack(alignment: .leading, spacing: 6) {
                Label(model.kind == .full ? "First unlock today" : "Unlocked again today", systemImage: "lock.open")
                Text("Briefing content (deadlines, tasks, habits, partner activity) arrives in the next milestone. This window already proves the unlock → briefing flow.")
                    .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            HStack {
                Button("Dismiss", action: dismiss).keyboardShortcut(.cancelAction)
                Spacer()
                Button(action: openDashboard) { Text("Open Full Dashboard").frame(minWidth: 150) }
                    .buttonStyle(.borderedProminent).controlSize(.large).keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .frame(minWidth: 440, minHeight: 300)
    }
}

/// Owns exactly one briefing window for the lifetime of the app.
final class BriefingWindowController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let model = BriefingModel()
    private var lastShownUnlockID: UUID?
    var openDashboard: () -> Void = {}

    var isVisible: Bool { window?.isVisible == true }

    /// Shows (or refreshes and raises) the single briefing window. A repeated call with the same
    /// unlockID is a no-op, so one unlock can never produce two windows or two raises.
    func show(kind: BriefingKind, unlockID: UUID) {
        if lastShownUnlockID == unlockID { Log.info("briefing already shown for \(unlockID.uuidString.prefix(8)); skipped"); return }
        lastShownUnlockID = unlockID
        model.kind = kind; model.shownAt = Date(); model.unlockID = unlockID

        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 340),
                             styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
                             backing: .buffered, defer: false)
            w.title = "RANA Briefing"
            w.titlebarAppearsTransparent = true
            w.isReleasedWhenClosed = false          // dismiss keeps the controller alive
            w.delegate = self
            w.contentView = NSHostingView(rootView: BriefingView(model: model,
                openDashboard: { [weak self] in self?.openDashboard(); self?.window?.close() },
                dismiss: { [weak self] in self?.window?.close() }))
            w.center()
            window = w
        }
        window?.level = .floating                   // above the just-unlocked desktop
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Log.info("briefing window shown kind=\(kind) windowCount=\(NSApp.windows.filter { $0.title == "RANA Briefing" }.count)")
    }

    func windowWillClose(_ notification: Notification) { Log.info("briefing dismissed (app keeps running)") }
}
