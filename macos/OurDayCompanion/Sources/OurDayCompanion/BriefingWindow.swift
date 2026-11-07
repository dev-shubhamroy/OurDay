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

struct SectionBox<Content: View>: View {
    let icon: String; let title: String; var count: Int? = nil
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon).foregroundStyle(.tint)
                Text(title).font(.subheadline.weight(.semibold))
                Spacer()
                if let count { Text("\(count)").font(.caption).foregroundStyle(.secondary).padding(.horizontal, 7).padding(.vertical, 1).background(.quaternary, in: Capsule()) }
            }
            content
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct DeadlineRow: View {
    let d: DeadlineItem
    var tint: Color { d.urgency == .critical ? .red : d.urgency == .approaching ? .orange : .accentColor }
    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(tint).frame(width: 3, height: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(d.title).font(.callout.weight(.medium)).lineLimit(1)
                Text("\(d.dayLabel), \(d.timeText) · \(BriefingEngine.remainingText(d.remaining))" + (d.ownerName.map { " · \($0)" } ?? ""))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if d.urgency != .normal { Text(d.urgency == .critical ? "Critical" : "Approaching").font(.caption2.weight(.semibold)).foregroundStyle(tint) }
        }
    }
}

struct BriefingContent: View {
    let b: Briefing
    private func empty(_ t: String) -> some View { Text(t).font(.callout).foregroundStyle(.secondary) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(b.greeting).font(.title3.weight(.semibold))
                if b.kind == .full { ForEach(b.summary, id: \.self) { Text($0).font(.callout).foregroundStyle(.secondary) } }
            }
            if b.kind == .update { updateBody } else { fullBody }
        }
    }

    // First unlock of the day: deadlines → tasks → habits → together
    @ViewBuilder var fullBody: some View {
        SectionBox(icon: "flag.fill", title: "Deadlines", count: b.deadlinesToday.count + b.deadlinesTomorrow.count + b.deadlinesUpcoming.count) {
            if b.deadlinesToday.isEmpty && b.deadlinesTomorrow.isEmpty && b.deadlinesUpcoming.isEmpty { empty("No active deadlines.") }
            if !b.deadlinesToday.isEmpty { Text("Today").font(.caption.weight(.semibold)).foregroundStyle(.secondary); ForEach(b.deadlinesToday) { DeadlineRow(d: $0) } }
            if !b.deadlinesTomorrow.isEmpty { Text("Tomorrow").font(.caption.weight(.semibold)).foregroundStyle(.secondary); ForEach(b.deadlinesTomorrow) { DeadlineRow(d: $0) } }
            if !b.deadlinesUpcoming.isEmpty { Text("Upcoming").font(.caption.weight(.semibold)).foregroundStyle(.secondary); ForEach(b.deadlinesUpcoming) { DeadlineRow(d: $0) } }
            if b.upcomingMore > 0 { Text("+ \(b.upcomingMore) more later").font(.caption).foregroundStyle(.secondary) }
            if b.completedDeadlinesToday > 0 { Text("\(b.completedDeadlinesToday) completed today").font(.caption).foregroundStyle(.secondary) }
        }
        SectionBox(icon: "checklist", title: "Tasks", count: b.tasksToday.filter { !$0.done }.count + b.tasksTomorrow.count) {
            Text("Today · \(b.tasksToday.filter { $0.done }.count) of \(b.tasksToday.count) done").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if b.tasksToday.isEmpty { empty("Nothing planned today.") }
            ForEach(b.tasksToday) { taskRow($0) }
            Text("Tomorrow").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if b.tasksTomorrow.isEmpty { empty("Nothing planned yet.") }
            ForEach(b.tasksTomorrow) { taskRow($0) }
        }
        SectionBox(icon: "repeat", title: "Habits", count: b.habits.count) {
            if b.habits.isEmpty { empty("No habits scheduled today.") }
            ForEach(b.habits) { h in
                HStack {
                    Image(systemName: h.done ? "checkmark.circle.fill" : "circle").foregroundStyle(h.done ? .green : .secondary)
                    Text(h.title).font(.callout).strikethrough(h.done)
                    Spacer()
                    if let p = h.partnerName, let pd = h.partnerDone { Text("\(p): \(pd ? "done" : "to do")").font(.caption).foregroundStyle(.secondary) }
                    if h.streak > 0 { Label("\(h.streak)", systemImage: "flame.fill").font(.caption).foregroundStyle(.orange) }
                }
            }
        }
        togetherBox
    }

    // Later unlocks: only what changed, plus the next deadline
    @ViewBuilder var updateBody: some View {
        if let at = b.previousAt {
            Text("Since your last briefing at \(BriefingEngine.timeText(at, .autoupdatingCurrent))").font(.callout).foregroundStyle(.secondary)
        }
        if b.changes.isEmpty {
            SectionBox(icon: "checkmark.seal", title: "No changes") { empty("Nothing new since your last briefing.") }
        } else {
            let mine = b.changes.filter { !$0.byPartner }, theirs = b.changes.filter { $0.byPartner }
            if !mine.isEmpty { SectionBox(icon: "bell", title: "What changed", count: mine.count) { ForEach(mine) { Text($0.text).font(.callout) } } }
            if !theirs.isEmpty { SectionBox(icon: "person.2.fill", title: "From \(b.partnerName ?? "your partner")", count: theirs.count) { ForEach(theirs) { Text($0.text).font(.callout) } } }
        }
        if let n = b.nextUp { SectionBox(icon: "flag.fill", title: "Next deadline") { DeadlineRow(d: n) } }
    }

    @ViewBuilder var togetherBox: some View {
        if let p = b.partnerName {
            SectionBox(icon: "person.2.fill", title: "Together · \(p)") {
                if b.together.isEmpty { empty("No activity from \(p) yet today.") }
                ForEach(b.together, id: \.self) { Text($0).font(.callout) }
            }
        }
    }

    private func taskRow(_ t: TaskItem) -> some View {
        HStack {
            Image(systemName: t.done ? "checkmark.square.fill" : "square").foregroundStyle(t.done ? .green : .secondary)
            Text(t.title).font(.callout).strikethrough(t.done).lineLimit(1)
            Spacer()
            if let o = t.ownerName { Text(o).font(.caption).foregroundStyle(.secondary) }
            if let tt = t.timeText { Text(tt).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

struct BriefingRoot: View {
    @ObservedObject var model: CompanionModel
    var openDashboard: () -> Void
    var dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles").font(.title2).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 1) {
                    Text("RANA").font(.headline)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }
            if let since = model.cachedSince {
                Label("Couldn’t reach OurDay. Showing cached data from \(BriefingEngine.timeText(since, .autoupdatingCurrent)).", systemImage: "wifi.exclamationmark")
                    .font(.caption).padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(.orange.opacity(0.18), in: RoundedRectangle(cornerRadius: 8))
            }
            Divider()
            ScrollView { content.frame(maxWidth: .infinity, alignment: .leading) }
            HStack {
                Button("Dismiss", action: dismiss).keyboardShortcut(.cancelAction)
                if model.phase == .ready || { if case .failed = model.phase { return true }; return false }() {
                    Button("Refresh") { Task { await model.loadBriefing(newSession: false) } }
                }
                Spacer()
                Button(action: openDashboard) { Text("Open Full Dashboard").frame(minWidth: 150) }
                    .buttonStyle(.borderedProminent).controlSize(.large).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20).frame(minWidth: 480, minHeight: 420)
    }

    var subtitle: String {
        switch model.phase {
        case .ready: return model.briefing?.kind == .update ? "Quick update since your last briefing" : "Your daily briefing"
        case .signedOut, .signingIn: return "Sign in to see your briefing"
        case .loading: return "Getting your briefing…"
        case .failed: return "Couldn’t load your briefing"
        }
    }

    @ViewBuilder var content: some View {
        switch model.phase {
        case .signedOut(let note): SignInView(model: model, note: note)
        case .signingIn: SignInView(model: model, note: nil)
        case .loading:
            if let b = model.briefing { BriefingContent(b: b) } else { HStack { ProgressView().controlSize(.small); Text("Loading from OurDay…").foregroundStyle(.secondary) } }
        case .ready:
            if let b = model.briefing { BriefingContent(b: b) }
        case .failed(let e):
            VStack(alignment: .leading, spacing: 8) {
                Label(e.userMessage, systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
                if e == .offline { Text("No saved data to show yet. It will load when you’re back online.").font(.callout).foregroundStyle(.secondary) }
            }
        }
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
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 640),
                             styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                             backing: .buffered, defer: false)
            w.title = "RANA Briefing"
            w.titlebarAppearsTransparent = true
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
