import Foundation

protocol BriefingStateStore {
    func load(userID: String) -> BriefingState?
    func save(_ s: BriefingState)
    func clear()
}

final class MemoryStateStore: BriefingStateStore {
    var value: BriefingState?
    func load(userID: String) -> BriefingState? { value?.userID == userID ? value : nil }
    func save(_ s: BriefingState) { value = s }
    func clear() { value = nil }
}

/// JSON file in Application Support, readable only by the user. Contains ids and status words, no titles.
final class FileStateStore: BriefingStateStore {
    let url: URL
    init(url: URL) { self.url = url }
    static func standard() -> FileStateStore {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OurDayCompanion")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return FileStateStore(url: dir.appendingPathComponent("briefing-state.json"))
    }
    func load(userID: String) -> BriefingState? {
        guard let d = try? Data(contentsOf: url) else { return nil }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        guard let s = try? dec.decode(BriefingState.self, from: d), s.userID == userID else { return nil }
        return s
    }
    func save(_ s: BriefingState) {
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        guard let d = try? enc.encode(s) else { return }
        try? d.write(to: url, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    func clear() { try? FileManager.default.removeItem(at: url) }
}
