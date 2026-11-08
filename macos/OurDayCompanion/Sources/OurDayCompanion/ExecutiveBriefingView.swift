import AppKit
import SwiftUI

// RANA's executive briefing. A reporting surface, not a conversation: no chat bubbles, no input, no suggestions.
// Everything shown comes from ExecutiveReport (deterministic, built from the user's real OurDay data).

/// Midnight Aurora tokens (same values as frontend/src/styles/index.css), resolved per appearance.
struct Aurora {
    let dark: Bool
    var bg: Color { dark ? Color(r: 8, g: 13, b: 24) : Color(r: 244, g: 247, b: 252) }
    var surface: Color { dark ? Color(r: 17, g: 31, b: 51) : .white }
    var fg: Color { dark ? Color(r: 232, g: 240, b: 250) : Color(r: 14, g: 28, b: 46) }
    var muted: Color { dark ? Color(r: 148, g: 167, b: 191) : Color(r: 82, g: 102, b: 128) }
    var line: Color { dark ? Color(r: 120, g: 160, b: 210).opacity(0.16) : Color(r: 40, g: 80, b: 130).opacity(0.14) }
    var accent: Color { dark ? Color(r: 39, g: 200, b: 255) : Color(r: 22, g: 141, b: 206) }
    var violet: Color { dark ? Color(r: 119, g: 117, b: 255) : Color(r: 113, g: 101, b: 217) }
    var ok: Color { dark ? Color(r: 66, g: 214, b: 150) : Color(r: 14, g: 130, b: 84) }
    var warn: Color { dark ? Color(r: 255, g: 181, b: 71) : Color(r: 176, g: 100, b: 0) }
    var danger: Color { dark ? Color(r: 255, g: 94, b: 108) : Color(r: 205, g: 45, b: 60) }
    var card: Color { dark ? Color.white.opacity(0.045) : Color.white.opacity(0.78) }
}
extension Color { init(r: Double, g: Double, b: Double) { self.init(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: 1) } }

/// Drives the understated entrance. Sections fade/slide in once, staggered; Reduce Motion shows everything at once.
final class Reveal: ObservableObject {
    @Published var shown = false
    let reduce = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    func start() { if reduce { shown = true } else { withAnimation(.easeOut(duration: 0.5)) { shown = true } } }
}

private struct Entrance: ViewModifier {
    @ObservedObject var reveal: Reveal
    let index: Int
    func body(content: Content) -> some View {
        content
            .opacity(reveal.shown ? 1 : 0)
            .offset(y: reveal.shown || reveal.reduce ? 0 : 10)
            .animation(reveal.reduce ? nil : .easeOut(duration: 0.45).delay(0.06 * Double(index)), value: reveal.shown)
    }
}
extension View { fileprivate func entrance(_ r: Reveal, _ i: Int) -> some View { modifier(Entrance(reveal: r, index: i)) } }

/// RANA's mark: a calm visor with two cyan eyes (same identity as the web app), softly lit.
struct RanaMark: View {
    let a: Aurora; var size: CGFloat = 52
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                .fill(LinearGradient(colors: [a.dark ? Color(r: 26, g: 42, b: 66) : Color(r: 30, g: 52, b: 82), Color(r: 8, g: 13, b: 24)], startPoint: .topLeading, endPoint: .bottomTrailing))
            RoundedRectangle(cornerRadius: size * 0.2, style: .continuous).fill(Color(r: 11, g: 18, b: 32))
                .overlay(RoundedRectangle(cornerRadius: size * 0.2, style: .continuous).stroke(Color(r: 39, g: 200, b: 255).opacity(0.5), lineWidth: 1.2))
                .frame(width: size * 0.64, height: size * 0.42)
            HStack(spacing: size * 0.17) {
                Capsule().fill(Color(r: 39, g: 200, b: 255)).frame(width: size * 0.11, height: size * 0.15)
                Capsule().fill(Color(r: 39, g: 200, b: 255)).frame(width: size * 0.11, height: size * 0.15)
            }
        }
        .frame(width: size, height: size)
        .shadow(color: Color(r: 39, g: 200, b: 255).opacity(a.dark ? 0.35 : 0.2), radius: 14, y: 4)
        .accessibilityLabel("RANA")
    }
}

struct ReportSection<Content: View>: View {
    let a: Aurora; let title: String; var trailing: String? = nil
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Text(title.uppercased()).font(.system(size: 11, weight: .semibold)).tracking(1.6).foregroundColor(a.accent)
                Rectangle().fill(a.line).frame(height: 1)
                if let trailing { Text(trailing).font(.system(size: 11)).foregroundColor(a.muted) }
            }
            content
        }
    }
}

struct StatTile: View {
    let a: Aurora; let s: ReportStat
    var tone: Color { s.tone == .alert ? a.danger : s.tone == .good ? a.ok : a.fg }
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(s.value)").font(.system(size: 30, weight: .semibold)).monospacedDigit().foregroundColor(tone)
            Text(s.label).font(.system(size: 11)).foregroundColor(a.muted).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 66, alignment: .topLeading)
        .padding(.horizontal, 12).padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(a.card))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(s.tone == .alert ? a.danger.opacity(0.45) : a.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

struct ScheduleRow: View {
    let a: Aurora; let e: ScheduleEntry
    var tint: Color {
        switch e.state { case .critical, .overdue: return a.danger; case .approaching: return a.warn; case .completed: return a.ok; case .upcoming: return a.accent }
    }
    var label: String? {
        switch e.state { case .critical: return "Critical"; case .approaching: return "Approaching"; case .overdue: return "Overdue"; case .completed: return "Completed"; case .upcoming: return nil }
    }
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 2).fill(tint).frame(width: 3, height: 38)
                .shadow(color: (e.state == .critical || e.state == .overdue) ? tint.opacity(0.6) : .clear, radius: 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.title).font(.system(size: 14, weight: .medium)).foregroundColor(e.state == .completed ? a.muted : a.fg).lineLimit(2)
                Text(e.detail + (e.ownerName.map { " · \($0)" } ?? "")).font(.system(size: 12)).foregroundColor(e.state == .critical || e.state == .overdue ? tint : a.muted)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(e.timeText).font(.system(size: 14, weight: .semibold)).monospacedDigit().foregroundColor(e.state == .completed ? a.muted : a.fg)
                if let label { Text(label.uppercased()).font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundColor(tint) }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(a.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(a.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

struct ReportView: View {
    let a: Aurora; let r: ExecutiveReport; let reveal: Reveal
    private func dot(_ c: Color) -> some View { Circle().fill(c).frame(width: 6, height: 6).padding(.top, 6) }
    private func line(_ t: String, _ c: Color) -> some View {
        HStack(alignment: .top, spacing: 10) { dot(c); Text(t).font(.system(size: 13.5)).foregroundColor(a.fg).fixedSize(horizontal: false, vertical: true) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text(r.greeting).font(.system(size: 28, weight: .semibold)).foregroundColor(a.fg)
                Text(r.intro).font(.system(size: 14)).foregroundColor(a.muted).fixedSize(horizontal: false, vertical: true)
            }.entrance(reveal, 0)

            if !r.stats.isEmpty {
                ReportSection(a: a, title: "Executive summary") {
                    HStack(alignment: .top, spacing: 10) { ForEach(r.stats) { StatTile(a: a, s: $0) } }
                }.entrance(reveal, 1)
            }

            if !r.priority.isEmpty {
                ReportSection(a: a, title: "Priority report") {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(r.priority) { p in line(p.text, p.level == .urgent ? a.danger : p.level == .attention ? a.warn : a.accent) }
                    }
                }.entrance(reveal, 2)
            }

            if r.kind == .full, let head = r.scheduleHeadline {
                ReportSection(a: a, title: "Today’s schedule") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(head).font(.system(size: 13.5)).foregroundColor(a.muted)
                        ForEach(r.schedule) { ScheduleRow(a: a, e: $0) }
                        if r.scheduleMore > 0 { Text("+ \(r.scheduleMore) more today").font(.system(size: 12)).foregroundColor(a.muted) }
                        if !r.otherTasks.isEmpty {
                            Text("Also planned today").font(.system(size: 12, weight: .semibold)).foregroundColor(a.muted).padding(.top, 4)
                            ForEach(r.otherTasks) { t in
                                HStack(spacing: 8) {
                                    Image(systemName: "circle").font(.system(size: 9)).foregroundColor(a.muted)
                                    Text(t.title).font(.system(size: 13)).foregroundColor(a.fg).lineLimit(1)
                                    Spacer()
                                    if let o = t.ownerName { Text(o).font(.system(size: 11)).foregroundColor(a.muted) }
                                    if let tt = t.timeText { Text(tt).font(.system(size: 12)).monospacedDigit().foregroundColor(a.muted) }
                                }
                            }
                            if r.otherTasksMore > 0 { Text("+ \(r.otherTasksMore) more").font(.system(size: 12)).foregroundColor(a.muted) }
                        }
                        if let t = r.tomorrowLine { Text(t).font(.system(size: 12.5)).foregroundColor(a.muted).padding(.top, 2) }
                    }
                }.entrance(reveal, 3)
            }

            if r.kind == .update { updateSections }

            if !r.habits.isEmpty {
                ReportSection(a: a, title: "Habits") {
                    VStack(alignment: .leading, spacing: 8) {
                        if let s = r.habitsSummary { Text(s).font(.system(size: 13.5)).foregroundColor(a.muted) }
                        ForEach(r.habits) { h in
                            HStack(spacing: 10) {
                                Image(systemName: h.state == .done ? "checkmark.circle.fill" : h.state == .missed ? "xmark.circle" : "circle")
                                    .foregroundColor(h.state == .done ? a.ok : h.state == .missed ? a.warn : a.muted)
                                Text(h.title).font(.system(size: 13.5)).foregroundColor(h.state == .done ? a.muted : a.fg)
                                Spacer()
                                if let p = h.partnerLine { Text(p).font(.system(size: 11.5)).foregroundColor(a.muted) }
                                if h.streak > 0 { Text("\(h.streak)-day streak").font(.system(size: 11.5)).foregroundColor(a.warn) }
                            }
                        }
                    }
                }.entrance(reveal, 4)
            }

            if !r.partner.isEmpty, let p = r.partnerName {
                ReportSection(a: a, title: "Partner updates", trailing: p) {
                    VStack(alignment: .leading, spacing: 8) { ForEach(r.partner, id: \.self) { line($0, a.violet) } }
                }.entrance(reveal, 5)
            }

            VStack(alignment: .leading, spacing: 8) {
                Rectangle().fill(a.line).frame(height: 1)
                Text(r.closing).font(.system(size: 13.5)).foregroundColor(a.fg).fixedSize(horizontal: false, vertical: true)
                Text("RANA").font(.system(size: 10, weight: .semibold)).tracking(2).foregroundColor(a.accent)
            }.entrance(reveal, 6)
        }
    }

    @ViewBuilder var updateSections: some View {
        if !r.ownChanges.isEmpty {
            ReportSection(a: a, title: "What changed") { VStack(alignment: .leading, spacing: 8) { ForEach(r.ownChanges, id: \.self) { line($0, a.accent) } } }.entrance(reveal, 3)
        }
        if !r.partnerChanges.isEmpty {
            ReportSection(a: a, title: "Partner updates", trailing: r.partnerName) { VStack(alignment: .leading, spacing: 8) { ForEach(r.partnerChanges, id: \.self) { line($0, a.violet) } } }.entrance(reveal, 4)
        }
        if let n = r.nextDeadline {
            ReportSection(a: a, title: "Next deadline") { ScheduleRow(a: a, e: n) }.entrance(reveal, 5)
        }
    }
}

struct BriefingRoot: View {
    @ObservedObject var model: CompanionModel
    var openDashboard: () -> Void
    var dismiss: () -> Void
    @Environment(\.colorScheme) private var scheme
    @StateObject private var reveal = Reveal()
    private var a: Aurora { Aurora(dark: scheme == .dark) }

    var body: some View {
        ZStack {
            background
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.horizontal, 28).padding(.top, 26).padding(.bottom, 14)
                if let since = model.cachedSince {
                    Text("Couldn’t reach OurDay. This report uses data saved at \(BriefingEngine.timeText(since, .autoupdatingCurrent)).")
                        .font(.system(size: 12)).foregroundColor(a.warn).padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 10).fill(a.warn.opacity(0.14))).padding(.horizontal, 28).padding(.bottom, 10)
                }
                ScrollView(showsIndicators: false) { content.padding(.horizontal, 28).padding(.bottom, 24).frame(maxWidth: .infinity, alignment: .leading) }
                footer.padding(.horizontal, 28).padding(.vertical, 14)
            }
        }
        .frame(minWidth: 520, minHeight: 520)
        .onAppear { reveal.start() }
    }

    var background: some View {
        ZStack {
            a.bg
            RadialGradient(colors: [a.accent.opacity(a.dark ? 0.20 : 0.15), .clear], center: .topTrailing, startRadius: 0, endRadius: 520)
            RadialGradient(colors: [a.violet.opacity(a.dark ? 0.19 : 0.13), .clear], center: .bottomLeading, startRadius: 0, endRadius: 520)
        }.ignoresSafeArea()
    }

    var header: some View {
        HStack(spacing: 14) {
            RanaMark(a: a, size: 50)
            VStack(alignment: .leading, spacing: 3) {
                Text("RANA").font(.system(size: 17, weight: .bold)).tracking(3).foregroundColor(a.fg)
                Text(eyebrow.uppercased()).font(.system(size: 10.5, weight: .semibold)).tracking(1.6).foregroundColor(a.accent)
            }
            Spacer()
            if let b = model.briefing { Text(b.report.dateLine).font(.system(size: 12.5, weight: .medium)).foregroundColor(a.muted) }
        }
    }

    var eyebrow: String {
        switch model.phase {
        case .ready: return model.briefing?.kind == .update ? "Update report" : "Daily executive briefing"
        case .signedOut, .signingIn: return "Sign in required"
        case .loading: return "Preparing your report"
        case .failed: return "Report unavailable"
        }
    }

    @ViewBuilder var content: some View {
        switch model.phase {
        case .signedOut(let note): SignInView(model: model, note: note)
        case .signingIn: SignInView(model: model, note: nil)
        case .loading:
            if let b = model.briefing { ReportView(a: a, r: b.report, reveal: reveal) }
            else { HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Reviewing your schedule…").foregroundColor(a.muted) } }
        case .ready:
            if let b = model.briefing { ReportView(a: a, r: b.report, reveal: reveal) }
        case .failed(let e):
            VStack(alignment: .leading, spacing: 8) {
                Text(e.userMessage).foregroundColor(a.warn)
                if e == .offline { Text("No saved data to report yet. The briefing will be available once OurDay can be reached.").font(.callout).foregroundColor(a.muted) }
            }
        }
    }

    var footer: some View {
        HStack {
            Button("Open dashboard", action: openDashboard).buttonStyle(.plain).font(.system(size: 12.5)).foregroundColor(a.muted)
            if case .failed = model.phase { Button("Try again") { Task { await model.loadBriefing(newSession: false) } }.buttonStyle(.plain).font(.system(size: 12.5)).foregroundColor(a.accent).padding(.leading, 12) }
            Spacer()
            Button(action: dismiss) {
                Text("Dismiss").font(.system(size: 13, weight: .semibold)).foregroundColor(a.dark ? Color(r: 4, g: 20, b: 32) : .white)
                    .frame(minWidth: 96).padding(.vertical, 9).padding(.horizontal, 8)
                    .background(Capsule().fill(a.accent))
            }
            .buttonStyle(.plain).keyboardShortcut(.cancelAction)
        }
    }
}
