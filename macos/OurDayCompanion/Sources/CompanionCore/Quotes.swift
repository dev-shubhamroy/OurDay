import Foundation

// Inspiration Library on the Mac: the same per-person rows the web app manages (table inspiration_quotes, RLS: owner only),
// read through the existing Supabase session. RANA shows one saved quote per briefing; nothing is ever invented.

struct QuoteRow: Codable, Equatable { var id: String; var text: String; var author: String?; var created_at: String? }
struct QuoteLine: Equatable { var id: String; var text: String; var author: String? }

/// Which quotes were shown in the current cycle, and the one chosen for the current briefing. Ids only (no quote text on disk).
struct QuoteSelection: Codable, Equatable {
    struct Current: Codable, Equatable { var key: String; var id: String }
    var history: [String] = []
    var current: Current? = nil
}

enum QuoteSelector {
    /// The quote for briefing `key`. The remembered pick is kept while the key and the quote still exist (so Refresh never
    /// changes it); a new key picks from the quotes not yet shown in this cycle, starting a new cycle once all were shown
    /// (never opening it with the quote that just closed the last cycle, when there is a choice). `pick(n)` returns 0..<n.
    static func select(_ rows: [QuoteRow], key: String, selection: inout QuoteSelection, pick: (Int) -> Int = { Int.random(in: 0..<$0) }) -> QuoteLine? {
        guard !rows.isEmpty else { return nil }
        let ids = rows.map(\.id)
        if let c = selection.current, c.key == key, ids.contains(c.id) { return line(rows, c.id) }
        var cycle = selection.history.filter(ids.contains)
        var pool = ids.filter { !cycle.contains($0) }
        if pool.isEmpty {
            let last = cycle.last
            cycle = []
            pool = ids.count > 1 ? ids.filter { $0 != last } : ids
        }
        let chosen = pool[min(pool.count - 1, max(0, pick(pool.count)))]
        selection.history = cycle + [chosen]
        selection.current = .init(key: key, id: chosen)
        return line(rows, chosen)
    }
    private static func line(_ rows: [QuoteRow], _ id: String) -> QuoteLine? {
        rows.first { $0.id == id }.map { QuoteLine(id: $0.id, text: $0.text, author: ($0.author?.trimmingCharacters(in: .whitespaces)).flatMap { $0.isEmpty ? nil : $0 }) }
    }
}

protocol QuoteStateStore {
    func load(userID: String) -> QuoteSelection
    func save(_ s: QuoteSelection, userID: String)
    func clear()
}

final class MemoryQuoteStore: QuoteStateStore {
    var values: [String: QuoteSelection] = [:]
    func load(userID: String) -> QuoteSelection { values[userID] ?? QuoteSelection() }
    func save(_ s: QuoteSelection, userID: String) { values[userID] = s }
    func clear() { values = [:] }
}

/// JSON file next to briefing-state.json, readable only by the user.
final class FileQuoteStore: QuoteStateStore {
    let url: URL
    init(url: URL) { self.url = url }
    static func standard() -> FileQuoteStore {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OurDayCompanion")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return FileQuoteStore(url: dir.appendingPathComponent("quote-state.json"))
    }
    private func all() -> [String: QuoteSelection] {
        guard let d = try? Data(contentsOf: url), let v = try? JSONDecoder().decode([String: QuoteSelection].self, from: d) else { return [:] }
        return v
    }
    func load(userID: String) -> QuoteSelection { all()[userID] ?? QuoteSelection() }
    func save(_ s: QuoteSelection, userID: String) {
        var v = all(); v[userID] = s
        guard let d = try? JSONEncoder().encode(v) else { return }
        try? d.write(to: url, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    func clear() { try? FileManager.default.removeItem(at: url) }
}
