import Foundation
import Combine

/// Настройки подключения к backend'у. baseURL хранится в UserDefaults
/// (не секретно), токен — в Keychain.
final class AppSettings: ObservableObject {
    @Published var baseURLString: String {
        didSet { UserDefaults.standard.set(baseURLString, forKey: Self.baseURLKey) }
    }
    @Published var apiToken: String {
        didSet { KeychainStore.save(apiToken) }
    }

    private static let baseURLKey = "backendBaseURL"

    init() {
        self.baseURLString = UserDefaults.standard.string(forKey: Self.baseURLKey) ?? "https://jobmonitor.castleduck.com"
        self.apiToken = KeychainStore.load() ?? ""
    }

    var baseURL: URL? { URL(string: baseURLString) }
    var isConfigured: Bool { baseURL != nil && !apiToken.isEmpty }
}
