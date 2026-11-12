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
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                RanaAvatar(size: 38)
                Text("Notifications").font(Fusion.display(24, 700)).foregroundColor(Fusion.text)
                if CentreRules.unread(model.centre) > 0 { Text("\(CentreRules.unread(model.centre)) unread").font(Fusion.body(12, 600)).foregroundColor(Fusion.accent) }
                Spacer()
                Button("Mark all read") { Task { await model.markAllRead() } }.buttonStyle(.plain).font(Fusion.body(13, 600)).foregroundColor(Fusion.accent)
                    .disabled(CentreRules.unread(model.centre) == 0).opacity(CentreRules.unread(model.centre) == 0 ? 0.4 : 1)
            }
            if !model.centreAvailable {
                Text("The notification centre isn’t set up on the server yet. Local reminders still work.").font(Fusion.body(14)).foregroundColor(Fusion.muted)
            } else if model.centre.isEmpty {
                Text("No notifications yet. Reminders appear here as deadlines approach.").font(Fusion.body(14)).foregroundColor(Fusion.muted).padding(.vertical, 20)
            }
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 8) {
                    ForEach(model.centre) { r in
                        Button(action: { open(r) }) {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: r.kind == "deadline" ? "flag.fill" : r.kind == "habit" ? "repeat" : "heart.fill").foregroundColor(Fusion.accent).frame(width: 34, height: 34)
                                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Fusion.accent.opacity(0.14)))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(r.title).font(Fusion.body(15, r.isUnread ? 700 : 500)).foregroundColor(Fusion.text)
                                    Text(r.body).font(Fusion.body(13)).foregroundColor(Fusion.muted).lineLimit(3).multilineTextAlignment(.leading)
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 6) {
                                    Text("\(day(r.date)), \(time(r.date))").font(Fusion.body(11)).foregroundColor(Fusion.muted)
                                    if r.isUnread { Circle().fill(Fusion.accent).frame(width: 9, height: 9) }
                                }
                            }
                            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: Fusion.radius, style: .continuous).fill(r.isUnread ? Fusion.accent.opacity(0.07) : Fusion.surface))
                            .overlay(RoundedRectangle(cornerRadius: Fusion.radius, style: .continuous).stroke(r.isUnread ? Fusion.accent.opacity(0.4) : Fusion.border, lineWidth: 1))
                            .contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }
            }
            Text("Same history as the OurDay web app and Android.").font(Fusion.body(12)).foregroundColor(Fusion.muted)
        }
        .padding(20).frame(minWidth: 480, minHeight: 440).background(Fusion.bg).preferredColorScheme(.dark)
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
            w.title = "OurDay Notifications"; w.isReleasedWhenClosed = false; w.delegate = self; w.appearance = NSAppearance(named: .darkAqua)
            w.backgroundColor = NSColor(srgbRed: 17 / 255, green: 17 / 255, blue: 20 / 255, alpha: 1)
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
