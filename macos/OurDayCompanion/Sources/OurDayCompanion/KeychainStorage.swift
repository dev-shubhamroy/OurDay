import Foundation
import Security

/// Stores the Supabase session (access + refresh token) as a generic password item in the macOS
/// Keychain. Never written to UserDefaults, files or logs.
final class KeychainSessionStorage: SessionStorage {
    private let service = "com.ourday.companion.session"
    private let account = "supabase"

    private var base: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] }

    func load() -> AuthSession? {
        var q = base; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        if status != errSecSuccess && status != errSecItemNotFound { Log.info("keychain read failed: OSStatus \(status)") }
        guard status == errSecSuccess, let d = out as? Data else { return nil }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(AuthSession.self, from: d)
    }

    func save(_ s: AuthSession) {
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        guard let d = try? enc.encode(s) else { return }
        let update = SecItemUpdate(base as CFDictionary, [kSecValueData as String: d] as CFDictionary)
        if update == errSecItemNotFound {
            var add = base
            add[kSecValueData as String] = d
            add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            let st = SecItemAdd(add as CFDictionary, nil)
            if st != errSecSuccess { Log.info("keychain save failed: OSStatus \(st)") }
        } else if update != errSecSuccess { Log.info("keychain update failed: OSStatus \(update)") }
    }

    func clear() { SecItemDelete(base as CFDictionary) }
}
