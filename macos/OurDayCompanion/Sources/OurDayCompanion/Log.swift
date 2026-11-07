import Foundation
import os

/// Logs events only (never tokens, emails or task content). Mirrored to a plain file so the
/// real lock/unlock behaviour can be audited after the fact.
enum Log {
    private static let logger = Logger(subsystem: "com.ourday.companion", category: "app")
    private static let fileURL: URL = {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/OurDayCompanion")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("companion.log")
    }()
    private static let queue = DispatchQueue(label: "com.ourday.companion.log")
    private static let formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.timeZone = .current; f.formatOptions = [.withInternetDateTime, .withFractionalSeconds, .withTimeZone]; return f
    }()

    static var path: String { fileURL.path }

    static func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
        let line = "\(formatter.string(from: Date())) \(message)\n"
        queue.async {
            if let data = line.data(using: .utf8) {
                if let h = try? FileHandle(forWritingTo: fileURL) { h.seekToEndOfFile(); h.write(data); try? h.close() }
                else { try? data.write(to: fileURL) }
            }
        }
    }
}
