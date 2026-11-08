import Foundation

// Inspiration Library: selection rules, persistence, decoding and the "JUST KNOW THAT –" report line (pure logic, fixtures only).

private func qrow(_ id: String, _ text: String = "t", author: String? = nil) -> QuoteRow { QuoteRow(id: id, text: text, author: author, created_at: nil) }

func runQuoteTests() {
    // ---- empty / one / many ----
    do {
        var sel = QuoteSelection()
        check(QuoteSelector.select([], key: "k", selection: &sel) == nil, "no saved quotes → no quote (section hidden)")
        check(sel == QuoteSelection(), "empty library leaves the selection untouched")
        let only = [qrow("a", "Only one", author: "Me")]
        check(QuoteSelector.select(only, key: "k1", selection: &sel) == QuoteLine(id: "a", text: "Only one", author: "Me"), "one quote is shown")
        check(QuoteSelector.select(only, key: "k2", selection: &sel)?.id == "a", "one quote is shown again for the next briefing")
    }
    // ---- optional author ----
    do {
        var sel = QuoteSelection()
        check(QuoteSelector.select([qrow("a", "x", author: nil)], key: "k", selection: &sel)?.author == nil, "no author → nil")
        sel = QuoteSelection()
        check(QuoteSelector.select([qrow("a", "x", author: "   ")], key: "k", selection: &sel)?.author == nil, "blank author → nil")
    }
    // ---- stable within a briefing, new for the next, no repeats until exhausted ----
    do {
        let rows = ["a", "b", "c", "d"].map { qrow($0) }
        var sel = QuoteSelection()
        let first = QuoteSelector.select(rows, key: "b1", selection: &sel, pick: { _ in 0 })!
        check(QuoteSelector.select(rows, key: "b1", selection: &sel, pick: { $0 - 1 })?.id == first.id, "refresh (same briefing key) keeps the same quote")
        var shown = [first.id]
        for i in 2...4 { shown.append(QuoteSelector.select(rows, key: "b\(i)", selection: &sel, pick: { _ in 0 })!.id) }
        check(Set(shown).count == 4, "every quote is shown once before any repeat (got \(shown))")
        let next = QuoteSelector.select(rows, key: "b5", selection: &sel, pick: { _ in 0 })!
        check(next.id != shown.last, "a new cycle never opens with the quote that just ended the last one")
        check(sel.history == [next.id], "a new cycle starts its own history")
    }
    // ---- deleted quote is replaced ----
    do {
        var sel = QuoteSelection()
        let a = QuoteSelector.select([qrow("a"), qrow("b")], key: "k", selection: &sel, pick: { _ in 0 })!
        let after = QuoteSelector.select([qrow(a.id == "a" ? "b" : "a")], key: "k", selection: &sel, pick: { _ in 0 })
        check(after != nil && after?.id != a.id, "a deleted quote is never shown")
    }
    // ---- persistence across restarts (ids only) ----
    do {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("quote-state-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = FileQuoteStore(url: url)
        var sel = store.load(userID: "u1")
        check(sel == QuoteSelection(), "fresh store → empty selection")
        let rows = [qrow("a", "Secret words"), qrow("b", "More words")]
        let q = QuoteSelector.select(rows, key: "k1", selection: &sel, pick: { _ in 0 })!
        store.save(sel, userID: "u1")
        var restored = FileQuoteStore(url: url).load(userID: "u1")
        check(QuoteSelector.select(rows, key: "k1", selection: &restored, pick: { _ in 1 })?.id == q.id, "after restart the same briefing shows the same quote")
        check(FileQuoteStore(url: url).load(userID: "u2") == QuoteSelection(), "another person's selection is separate")
        let raw = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        check(!raw.contains("Secret words"), "persisted state contains no quote text")
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        check((attrs?[.posixPermissions] as? NSNumber)?.intValue == 0o600, "state file is owner-only")
        store.clear(); check(store.load(userID: "u1") == QuoteSelection(), "sign-out clears quote state")
    }
    // ---- web ⇄ Mac: rows decode exactly as PostgREST returns them ----
    do {
        let json = #"[{"id":"7c0f3a52-0000-4000-8000-000000000001","text":"Keep going.","author":null,"created_at":"2026-11-09T10:00:00.123456+00:00"},{"id":"7c0f3a52-0000-4000-8000-000000000002","text":"Begin.","author":"Ada","created_at":"2026-11-09T10:01:00+00:00"}]"#
        let rows = try? JSONDecoder().decode([QuoteRow].self, from: Data(json.utf8))
        check(rows?.count == 2 && rows?[0].author == nil && rows?[1].author == "Ada", "web-saved rows decode on the Mac")
    }
    // ---- both briefing kinds carry the quote; nothing is invented ----
    do {
        let line = QuoteLine(id: "a", text: "Begin.", author: "Ada")
        let full = BriefingEngine.build(snapshot: snap(), now: now0, cal: ist, previous: nil, quote: line).report
        check(full.kind == .full && full.quote == line, "full briefing shows the quote")
        let prev = BriefingEngine.stateAfter(snap(), now: now0.addingTimeInterval(-3600), cal: ist)
        let update = BriefingEngine.build(snapshot: snap(), now: now0, cal: ist, previous: prev, quote: line).report
        check(update.kind == .update && update.quote == line, "update briefing shows the quote")
        check(BriefingEngine.build(snapshot: snap(), now: now0, cal: ist, previous: nil).report.quote == nil, "no quote given → section hidden (nothing invented)")
    }
}
