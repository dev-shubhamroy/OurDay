import AppKit
import CoreText
import SwiftUI

// RANA's briefing: a reporting surface (no chat, no input). Everything shown comes from ExecutiveReport, which is built
// deterministically from the user's real OurDay data. Visual language: "Fusion" (graphite base, soft crimson accent,
// colour-coded sections; Bricolage Grotesque for display, Inter for text). Dark only: the palette defines no light theme.

enum Fusion {
    static func hex(_ v: UInt32) -> Color { Color(.sRGB, red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255, opacity: 1) }
    static let bg = hex(0x111113), surface = hex(0x17171A), chip = hex(0x202024), border = hex(0x2A2A30), pill = hex(0x1B1B1F)
    static let text = hex(0xF3F3F5), textSecondary = hex(0xC7C7CF), muted = hex(0xA4A4AD)
    static let accent = hex(0xFF6A6F), kicker = hex(0xFF7B7F), button = hex(0xD23B41)
    // colour coding: band bg, band text, ring stroke, tag bg, tag text
    static let urgentBand = hex(0x2A1618), urgentText = hex(0xFFB3B6), urgentRing = hex(0xE5484D), urgentTagBg = hex(0x3A1A1C), urgentTag = hex(0xFF9A9D)
    static let todayBand = hex(0x142133), todayText = hex(0xB5D0FF), todayRing = hex(0x4C8DF6), todayTagBg = hex(0x1B2A44), todayTag = hex(0x9CC3FF)
    static let habitBlock = hex(0x1E1838), habitText = hex(0xC9B8FF)
    static let progressBlock = hex(0x11251C), progressText = hex(0x7BDDB6)

    static func display(_ size: CGFloat, _ weight: Int) -> Font { .custom(weight >= 800 ? "BricolageGrotesque-ExtraBold" : weight >= 700 ? "BricolageGrotesque-Bold" : "BricolageGrotesque-Medium", fixedSize: size) }
    static func body(_ size: CGFloat, _ weight: Int = 400, italic: Bool = false) -> Font {
        .custom(italic ? "Inter-Italic" : weight >= 700 ? "Inter-Bold" : weight >= 600 ? "Inter-SemiBold" : weight >= 500 ? "Inter-Medium" : "Inter-Regular", fixedSize: size)
    }
}

/// Registers the bundled Bricolage Grotesque and Inter files (Contents/Resources/Fonts) for this process.
enum BrandFonts {
    static func register() {
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("Fonts"),
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return }
        for f in files where f.pathExtension == "ttf" { CTFontManagerRegisterFontsForURL(f as CFURL, .process, nil) }
    }
}

/// Drives the understated entrance. Sections fade/slide in once, staggered; Reduce Motion shows everything at once.
final class Reveal: ObservableObject {
    @Published var shown = false
    let reduce = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    func start() { if reduce { shown = true } else { withAnimation(.easeOut(duration: 0.45)) { shown = true } } }
}
private struct Entrance: ViewModifier {
    @ObservedObject var reveal: Reveal
    let index: Int
    func body(content: Content) -> some View {
        content.opacity(reveal.shown ? 1 : 0).offset(y: reveal.shown || reveal.reduce ? 0 : 8)
            .animation(reveal.reduce ? nil : .easeOut(duration: 0.4).delay(0.05 * Double(index)), value: reveal.shown)
    }
}
extension View { fileprivate func entrance(_ r: Reveal, _ i: Int) -> some View { modifier(Entrance(reveal: r, index: i)) } }

private struct Ring: View {
    let color: Color
    var body: some View { Circle().stroke(color, lineWidth: 1.8).frame(width: 18, height: 18) }
}
private struct Tag: View {
    let text: String; let fg: Color; let bg: Color; var upper = true; var font: Font = Fusion.body(11, 700)
    var body: some View {
        Text(upper ? text.uppercased() : text).font(font).tracking(upper ? 0.9 : 0).foregroundColor(fg)
            .padding(.horizontal, 10).padding(.vertical, 4).background(Capsule().fill(bg))
    }
}

/// Card with a coloured header band (icon + title) and a body.
struct BandCard<Body: View>: View {
    let icon: String; let title: String; let band: Color; let bandText: Color
    @ViewBuilder var content: Body
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: icon).font(.system(size: 17, weight: .regular)).foregroundColor(bandText)
                Text(title).font(Fusion.display(17, 700)).foregroundColor(bandText).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 18).padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading).background(band)
            VStack(alignment: .leading, spacing: 8) { content }.padding(.horizontal, 18).padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Fusion.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Fusion.border, lineWidth: 1))
    }
}

/// Short list stays plain; a long one scrolls inside its card.
struct LimitedList<Content: View>: View {
    let count: Int; let rowHeight: CGFloat; let visibleRows: Int
    @ViewBuilder var content: Content
    var body: some View {
        if count > visibleRows {
            ScrollView(showsIndicators: true) { VStack(alignment: .leading, spacing: 8) { content }.padding(.trailing, 6) }
                .frame(height: CGFloat(visibleRows) * rowHeight + CGFloat(visibleRows - 1) * 8)
        } else { VStack(alignment: .leading, spacing: 8) { content } }
    }
}

private struct ChipRow<Lead: View, Trail: View, Main: View>: View {
    @ViewBuilder var lead: Lead; @ViewBuilder var main: Main; @ViewBuilder var trail: Trail
    var body: some View {
        HStack(spacing: 12) { lead; main; Spacer(minLength: 8); trail }
            .padding(.horizontal, 14).padding(.vertical, 10).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Fusion.chip))
            .accessibilityElement(children: .combine)
    }
}

struct AttentionRow: View {
    let i: AttentionItem
    var body: some View {
        ChipRow(lead: { Ring(color: Fusion.urgentRing) }, main: {
            VStack(alignment: .leading, spacing: 2) {
                Text(i.title).font(Fusion.body(16, 500)).foregroundColor(Fusion.text).lineLimit(2)
                if i.level != .overdue || i.detail.contains(",") { Text(i.detail + (i.ownerName.map { " · \($0)" } ?? "")).font(Fusion.body(13)).foregroundColor(Fusion.muted).lineLimit(1) }
            }
        }, trail: { Tag(text: i.status, fg: Fusion.urgentTag, bg: Fusion.urgentTagBg) })
    }
}

struct PlanRow: View {
    let e: ScheduleEntry
    var body: some View {
        ChipRow(lead: { Ring(color: Fusion.todayRing) }, main: {
            VStack(alignment: .leading, spacing: 2) {
                Text(e.title).font(Fusion.body(18, 600)).foregroundColor(Fusion.text).lineLimit(2)
                Text(e.detail + (e.ownerName.map { " · \($0)" } ?? "")).font(Fusion.body(13)).foregroundColor(Fusion.muted)
            }
        }, trail: { Tag(text: e.timeText, fg: Fusion.todayTag, bg: Fusion.todayTagBg, upper: false, font: Fusion.body(13, 600)) })
    }
}

/// Small card: a 64pt coloured icon block on the left, text on the right.
struct SideCard<Body: View>: View {
    let icon: String; let block: Color; let iconColor: Color
    @ViewBuilder var content: Body
    var body: some View {
        HStack(spacing: 0) {
            ZStack { block; Image(systemName: icon).font(.system(size: 24, weight: .light)).foregroundColor(iconColor) }.frame(width: 64)
            VStack(alignment: .leading, spacing: 4) { content }.padding(.horizontal, 20).padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .background(Fusion.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Fusion.border, lineWidth: 1))
    }
}

struct ReportView: View {
    let r: ExecutiveReport; let reveal: Reveal
    private var emptyDay: Bool { r.attention.isEmpty && r.schedule.isEmpty }

    /// "You forgot to do Meditation yesterday." with the habit name highlighted.
    private func habitLine(_ i: Int) -> Text {
        let sentence = r.missedHabits[i]
        let title = i < r.missedHabitTitles.count ? r.missedHabitTitles[i] : ""
        guard !title.isEmpty, let range = sentence.range(of: title) else { return Text(sentence) }
        return Text(String(sentence[..<range.lowerBound])) + Text(title).foregroundColor(Fusion.habitText).fontWeight(.semibold) + Text(String(sentence[range.upperBound...]))
    }
    private func partnerText(_ line: String, name: String) -> String {
        guard line.hasPrefix(name + " ") else { return line }
        let rest = String(line.dropFirst(name.count + 1)); return rest.prefix(1).uppercased() + rest.dropFirst()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let q = r.quote {      // plain text on the background: kicker, quote, author
                VStack(alignment: .leading, spacing: 8) {
                    Text("JUST KNOW THAT –").font(Fusion.body(12, 600)).tracking(1.9).foregroundColor(Fusion.kicker)
                    Text("“\(q.text)”").font(Fusion.display(31, 500)).tracking(-0.3).lineSpacing(3).foregroundColor(Fusion.text).fixedSize(horizontal: false, vertical: true)
                    if let author = q.author { Text("— \(author)").font(Fusion.body(14)).foregroundColor(Fusion.muted) }
                }.accessibilityElement(children: .combine).entrance(reveal, 1)
            }

            HStack(alignment: .top, spacing: 18) {
                if !r.attention.isEmpty {
                    BandCard(icon: "exclamationmark.triangle", title: ExecutiveReport.attentionIntro, band: Fusion.urgentBand, bandText: Fusion.urgentText) {
                        LimitedList(count: r.attention.count, rowHeight: 48, visibleRows: 5) { ForEach(r.attention) { AttentionRow(i: $0) } }
                    }
                }
                if r.kind == .full && (!r.schedule.isEmpty || emptyDay) {
                    BandCard(icon: "calendar", title: r.schedule.isEmpty ? (r.emptyDayNote ?? "Nothing is scheduled for today.") : ExecutiveReport.scheduleIntro, band: Fusion.todayBand, bandText: Fusion.todayText) {
                        if !r.schedule.isEmpty { LimitedList(count: r.schedule.count, rowHeight: 62, visibleRows: 4) { ForEach(r.schedule) { PlanRow(e: $0) } } }
                    }
                }
                if r.kind == .update && (!r.ownChanges.isEmpty) {
                    BandCard(icon: "calendar", title: r.sinceTitle ?? "What changed", band: Fusion.todayBand, bandText: Fusion.todayText) {
                        ForEach(r.ownChanges, id: \.self) { Text($0).font(Fusion.body(15)).foregroundColor(Fusion.text).fixedSize(horizontal: false, vertical: true) }
                    }
                }
            }.entrance(reveal, 2)

            HStack(alignment: .top, spacing: 18) {
                if !r.missedHabits.isEmpty {
                    SideCard(icon: "leaf", block: Fusion.habitBlock, iconColor: Fusion.habitText) {
                        ForEach(r.missedHabits.indices, id: \.self) { habitLine($0).font(Fusion.body(16)).foregroundColor(Fusion.text).fixedSize(horizontal: false, vertical: true) }
                    }
                }
                if let p = r.partnerName, !(r.kind == .full ? r.partnerLines : r.partnerChanges).isEmpty {
                    SideCard(icon: "heart", block: Fusion.progressBlock, iconColor: Fusion.progressText) {
                        Text(p).font(Fusion.display(18, 700)).foregroundColor(Fusion.text)
                        ForEach(r.kind == .full ? r.partnerLines : r.partnerChanges, id: \.self) { Text(partnerText($0, name: p)).font(Fusion.body(14)).foregroundColor(Fusion.muted).fixedSize(horizontal: false, vertical: true) }
                    }
                }
            }.entrance(reveal, 3)
        }
    }
}

struct BriefingRoot: View {
    @ObservedObject var model: CompanionModel
    var openDashboard: () -> Void
    var dismiss: () -> Void
    @StateObject private var reveal = Reveal()

    var body: some View {
        ZStack {
            Fusion.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                top.padding(.horizontal, 48).padding(.top, 36).padding(.bottom, 18)
                if let since = model.cachedSince {
                    Text("Couldn’t reach OurDay. This report uses data saved at \(BriefingEngine.timeText(since, .autoupdatingCurrent)).")
                        .font(Fusion.body(13)).foregroundColor(Fusion.urgentTag).padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Fusion.urgentBand)).padding(.horizontal, 48).padding(.bottom, 14)
                }
                ScrollView(showsIndicators: false) { content.padding(.horizontal, 48).frame(maxWidth: .infinity, alignment: .leading) }
                footer.padding(.horizontal, 48).padding(.top, 14).padding(.bottom, 26)
            }
        }
        .frame(minWidth: 760, minHeight: 560)
        .preferredColorScheme(.dark)
        .onAppear { reveal.start() }
    }

    /// Greeting (left) and date pill (right).
    var top: some View {
        HStack(alignment: .top) {
            if let r = model.briefing?.report {
                (Text(r.greetingLead + " ").foregroundColor(Fusion.text) + Text(r.greetingName).foregroundColor(Fusion.accent))
                    .font(Fusion.display(50, 800)).tracking(-1.75).lineLimit(2).minimumScaleFactor(0.6).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            HStack(spacing: 8) {
                Image(systemName: "calendar").font(.system(size: 13))
                Text(model.briefing?.report.dateLine ?? ExecutiveReportBuilder.dateLine(Date(), .autoupdatingCurrent)).font(Fusion.body(14))
            }
            .foregroundColor(Fusion.muted).padding(.horizontal, 16).padding(.vertical, 8)
            .background(Capsule().fill(Fusion.pill)).overlay(Capsule().stroke(Fusion.border, lineWidth: 1))
            .padding(.top, 4)
        }
        .entrance(reveal, 0)
    }

    @ViewBuilder var content: some View {
        switch model.phase {
        case .signedOut(let note): SignInView(model: model, note: note).foregroundColor(Fusion.text)
        case .signingIn: SignInView(model: model, note: nil).foregroundColor(Fusion.text)
        case .loading:
            if let b = model.briefing { ReportView(r: b.report, reveal: reveal) }
            else { HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Reviewing your schedule…").font(Fusion.body(14)).foregroundColor(Fusion.muted) } }
        case .ready:
            if let b = model.briefing { ReportView(r: b.report, reveal: reveal) }
        case .failed(let e):
            VStack(alignment: .leading, spacing: 8) {
                Text(e.userMessage).font(Fusion.body(15)).foregroundColor(Fusion.urgentTag)
                if e == .offline { Text("No saved data to report yet. The briefing will be available once OurDay can be reached.").font(Fusion.body(13)).foregroundColor(Fusion.muted) }
            }
        }
    }

    /// Closing line (left); Open dashboard and Dismiss (right).
    var footer: some View {
        HStack(spacing: 18) {
            Text(model.briefing?.report.closing ?? "").font(Fusion.body(16, italic: true)).foregroundColor(Fusion.textSecondary).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 12)
            if case .failed = model.phase { Button("Try again") { Task { await model.loadBriefing(newSession: false) } }.buttonStyle(.plain).font(Fusion.body(14, 600)).foregroundColor(Fusion.accent) }
            Button(action: openDashboard) {
                HStack(spacing: 6) { Text("Open dashboard").font(Fusion.body(14, 600)); Image(systemName: "arrow.up.right.square").font(.system(size: 13)) }.foregroundColor(Fusion.text)
            }.buttonStyle(.plain)
            Button(action: dismiss) {
                Text("Dismiss").font(Fusion.display(16, 700)).foregroundColor(.white).frame(minWidth: 118, minHeight: 46)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Fusion.button))
            }.buttonStyle(.plain).keyboardShortcut(.cancelAction)
        }
        .entrance(reveal, 4)
    }
}
