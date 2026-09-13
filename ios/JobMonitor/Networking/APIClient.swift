import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Укажите адрес backend'а и API-токен в Настройках."
        case .invalidResponse:
            return "Некорректный ответ сервера."
        case .server(let status, let message):
            return "Ошибка сервера (\(status)): \(message)"
        }
    }
}

/// Тонкий клиент поверх REST API backend'а. Все методы — async/await поверх URLSession.
final class APIClient {
    // Node/Prisma сериализует даты как ISO 8601 с миллисекундами (например
    // "2024-01-01T00:00:00.000Z"), а стандартная стратегия JSONDecoder
    // `.iso8601` дробные секунды не поддерживает — отсюда собственные форматтеры.
    private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private let settings: AppSettings
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(settings: AppSettings, session: URLSession = .shared) {
        self.settings = settings
        self.session = session

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = APIClient.iso8601WithFractionalSeconds.date(from: string) {
                return date
            }
            if let date = APIClient.iso8601.date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO8601 date: \(string)")
        }
        self.decoder = decoder

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(APIClient.iso8601WithFractionalSeconds.string(from: date))
        }
        self.encoder = encoder
    }

    // MARK: - Vacancies

    func fetchVacancies(filter: VacancyFilter) async throws -> [Vacancy] {
        try await get("/api/vacancies", query: ["filter": filter.rawValue])
    }

    func hideVacancy(id: String) async throws {
        try await post("/api/vacancies/\(id)/hide", body: EmptyBody())
    }

    func unhideVacancy(id: String) async throws {
        try await post("/api/vacancies/\(id)/unhide", body: EmptyBody())
    }

    func fetchVacancySummary() async throws -> VacancySummary {
        try await get("/api/vacancies/summary")
    }

    func markAllVacanciesSeen() async throws {
        try await post("/api/vacancies/mark-all-seen", body: EmptyBody())
    }

    func clearAllVacancies() async throws {
        try await delete("/api/vacancies")
    }

    // MARK: - Sources

    func fetchSources() async throws -> [JobSource] {
        try await get("/api/sources")
    }

    func setSourceEnabled(id: String, enabled: Bool) async throws {
        try await patch("/api/sources/\(id)", body: ["enabled": enabled])
    }

    // MARK: - Source discovery (каталог кандидатов)

    func fetchSourceCandidates() async throws -> [SourceCandidate] {
        try await get("/api/source-candidates")
    }

    struct AddSourceCandidateRequest: Encodable {
        let name: String
        let country: String?
        let type: String
        let boardSlug: String?
        let feedUrl: String?
        let url: String?
    }

    func addSourceCandidate(
        name: String,
        country: String?,
        type: CandidateType,
        boardSlug: String?,
        feedUrl: String?,
        url: String? = nil
    ) async throws -> SourceCandidate {
        let body = AddSourceCandidateRequest(name: name, country: country, type: type.rawValue, boardSlug: boardSlug, feedUrl: feedUrl, url: url)
        return try await post("/api/source-candidates", body: body)
    }

    func deleteSourceCandidate(id: String) async throws {
        try await delete("/api/source-candidates/\(id)")
    }

    func runDiscoveryNow() async throws -> DiscoveryResult {
        try await post("/api/source-candidates/discover", body: EmptyBody())
    }

    func fetchLastDiscovery() async throws -> DiscoveryRun? {
        try await getOptional("/api/scan/last-discovery")
    }

    // MARK: - Job titles

    func fetchJobTitles() async throws -> [JobTitle] {
        try await get("/api/job-titles")
    }

    func addJobTitle(_ title: String) async throws -> JobTitle {
        try await post("/api/job-titles", body: ["title": title])
    }

    func setJobTitleSelected(id: String, selected: Bool) async throws {
        try await patch("/api/job-titles/\(id)", body: ["selected": selected])
    }

    func renameJobTitle(id: String, title: String) async throws {
        try await patch("/api/job-titles/\(id)", body: ["title": title])
    }

    func deleteJobTitle(id: String) async throws {
        try await delete("/api/job-titles/\(id)")
    }

    // MARK: - Criteria

    func fetchCriteria() async throws -> SearchCriteria {
        try await get("/api/criteria")
    }

    func updateCriteria(_ criteria: SearchCriteria) async throws -> SearchCriteria {
        try await put("/api/criteria", body: criteria)
    }

    // MARK: - Scan

    func runScan() async throws -> ScanResult {
        try await post("/api/scan/run", body: EmptyBody())
    }

    func fetchLastScan() async throws -> ScanRun? {
        try await getOptional("/api/scan/last")
    }

    // MARK: - Core request plumbing

    private struct EmptyBody: Encodable {}

    private func makeURL(_ path: String, query: [String: String] = [:]) throws -> URL {
        guard let base = settings.baseURL else { throw APIError.notConfigured }
        guard var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidResponse
        }
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw APIError.invalidResponse }
        return url
    }

    private func makeRequest(_ path: String, method: String, query: [String: String] = [:]) throws -> URLRequest {
        guard !settings.apiToken.isEmpty else { throw APIError.notConfigured }
        var request = URLRequest(url: try makeURL(path, query: query))
        request.httpMethod = method
        request.setValue("Bearer \(settings.apiToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? ""
            throw APIError.server(status: http.statusCode, message: message)
        }
        if data.isEmpty, Response.self == EmptyResponse.self {
            return EmptyResponse() as! Response
        }
        return try decoder.decode(Response.self, from: data)
    }

    private struct EmptyResponse: Decodable {}

    private func get<Response: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> Response {
        let request = try makeRequest(path, method: "GET", query: query)
        return try await send(request)
    }

    // Для эндпоинтов вида `res.json(possiblyNullRow)`, которые при отсутствии
    // записи отдают буквальный JSON `null` — обычная decode(Optional<T>.self)
    // через `get` не нужна, читаем тело руками и трактуем "null"/пустое как nil.
    private func getOptional<Response: Decodable>(_ path: String) async throws -> Response? {
        let request = try makeRequest(path, method: "GET")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? ""
            throw APIError.server(status: http.statusCode, message: message)
        }
        let trimmed = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == nil || trimmed == "null" || trimmed?.isEmpty == true {
            return nil
        }
        return try decoder.decode(Response.self, from: data)
    }

    private func post<Body: Encodable, Response: Decodable>(_ path: String, body: Body) async throws -> Response {
        var request = try makeRequest(path, method: "POST")
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    private func post(_ path: String, body: some Encodable) async throws {
        var request = try makeRequest(path, method: "POST")
        request.httpBody = try encoder.encode(body)
        let _: EmptyResponse = try await send(request)
    }

    private func patch(_ path: String, body: [String: Bool]) async throws {
        var request = try makeRequest(path, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let _: EmptyResponse = try await send(request)
    }

    private func patch(_ path: String, body: [String: String]) async throws {
        var request = try makeRequest(path, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let _: EmptyResponse = try await send(request)
    }

    private func put<Body: Encodable, Response: Decodable>(_ path: String, body: Body) async throws -> Response {
        var request = try makeRequest(path, method: "PUT")
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    private func delete(_ path: String) async throws {
        let request = try makeRequest(path, method: "DELETE")
        let _: EmptyResponse = try await send(request)
    }
}
