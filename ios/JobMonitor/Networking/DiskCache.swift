import Foundation

/// Простой JSON-кэш на диске для списков, которые долго грузятся с backend'а
/// (вакансии, источники) — при открытии вкладки сразу показываем то, что
/// видели в прошлый раз, и обновляем в фоне сетевым запросом, вместо того
/// чтобы держать пользователя перед пустым экраном/спиннером на время
/// похода на VPS. Application Support, а не Caches — системе разрешено
/// чистить Caches при нехватке места, а здесь смысл именно в том, чтобы
/// данные это пережили.
///
/// Кодирует даты как секунды от эпохи — это раунд-трип внутри самого
/// приложения (записали → прочитали), формат сервера (ISO 8601 с дробными
/// секундами, см. APIClient) тут ни при чём.
enum DiskCache {
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }()

    private static func fileURL(_ key: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(key).json")
    }

    static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let url = fileURL(key), let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(T.self, from: data)
    }

    static func save<T: Encodable>(_ value: T, key: String) {
        guard let url = fileURL(key), let data = try? encoder.encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
