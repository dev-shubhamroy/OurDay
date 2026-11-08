import AppKit
import SwiftUI

struct CentreView: View {
    @ObservedObject var model: CompanionModel
    var open: (NotificationRow) -> Void

    private func time(_ d: Date) -> String { BriefingEngine.timeText(d, .autoupdatingCurrent) }
    private func day(_ d: Date) -> String {
        let cal = Calendar.autoupdatingCurrent
        return cal.isDateInToday(d) ? "Today" : cal.isDateInYesterday(d) ? "Yesterday" : BriefingEngine.shortDate(BriefingDay.key(for: d), cal)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Notifications").font(.title3.weight(.semibold))
                if CentreRules.unread(model.centre) > 0 { Text("\(CentreRules.unread(model.centre)) unread").font(.caption).foregroundStyle(.tint) }
                Spacer()
                Button("Mark all read") { Task { await model.markAllRead() } }.disabled(CentreRules.unread(model.centre) == 0)
            }
            if !model.centreAvailable {
                Text("The notification centre isn’t set up on the server yet. Local reminders still work.").font(.callout).foregroundStyle(.secondary)
            } else if model.centre.isEmpty {
                Text("No notifications yet. Reminders appear here as deadlines approach.").font(.callout).foregroundStyle(.secondary).padding(.vertical, 20)
            }
            List(model.centre) { r in
                Button(action: { open(r) }) {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: r.kind == "deadline" ? "flag.fill" : r.kind == "habit" ? "repeat" : "person.2.fill").foregroundStyle(r.isUnread ? Color.accentColor : .secondary).frame(width: 18)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.title).font(.callout.weight(r.isUnread ? .semibold : .regular))
                            Text(r.body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(day(r.date)), \(time(r.date))").font(.caption2).foregroundStyle(.secondary)
                            if r.isUnread { Circle().fill(Color.accentColor).frame(width: 7, height: 7) }
                        }
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain)
            }.listStyle(.inset)
            HStack { Text("Same history as the OurDay web app.").font(.caption).foregroundStyle(.secondary); Spacer() }
        }
        .padding(16).frame(minWidth: 460, minHeight: 420)
    }
}

final class NotificationCentreController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private let model: CompanionModel
    var openDashboard: (String) -> Void = { _ in }
    init(model: CompanionModel) { self.model = model }

    func show() {
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 560), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            w.title = "OurDay Notifications"; w.isReleasedWhenClosed = false; w.delegate = self
            w.contentView = NSHostingView(rootView: CentreView(model: model, open: { [weak self] r in
                Task { await self?.model.markRead([r.id]) }
                self?.openDashboard(r.dashboardPath)
            }))
            w.center(); window = w
        }
        window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        Task { await model.backgroundSync(reason: "centre opened") }
    }
}
