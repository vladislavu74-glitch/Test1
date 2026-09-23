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

    /// Вызывается при открытии конкретной вакансии — снимает "Новое" именно
    /// с неё, а не со всего показанного списка.
    func markVacancySeen(id: String) async throws {
        try await post("/api/vacancies/\(id)/seen", body: EmptyBody())
    }

    func clearAllVacancies() async throws {
        try await delete("/api/vacancies")
    }

    // MARK: - Hiring resources (поиск и верификация ресурсов найма)

    struct HiringResourceFilter {
        var category: String?
        var status: String?
        var minScore: Int?
    }

    func fetchHiringResources(filter: HiringResourceFilter = .init()) async throws -> [HiringResource] {
        var query: [String: String] = [:]
        if let category = filter.category { query["category"] = category }
        if let status = filter.status { query["status"] = status }
        if let minScore = filter.minScore { query["minScore"] = String(minScore) }
        return try await get("/api/hiring-resources", query: query)
    }

    func fetchHiringResource(id: String) async throws -> HiringResourceDetail {
        try await get("/api/hiring-resources/\(id)")
    }

    func fetchHiringResourceSummary() async throws -> HiringResourceSummary {
        try await get("/api/hiring-resources/summary")
    }

    func markAllHiringResourcesSeen() async throws {
        try await post("/api/hiring-resources/mark-all-seen", body: EmptyBody())
    }

    /// Запускает поиск в фоне на backend'е — сразу возвращает id запуска, не
    /// дожидаясь завершения (может занять несколько минут). Прогресс — через
    /// fetchHiringResourceRun(id:), опрашиваемый по таймеру.
    func startHiringResourceDiscovery(params: HiringResourceRunParams) async throws -> StartDiscoveryResponse {
        try await post("/api/hiring-resources/discover", body: params)
    }

    func fetchHiringResourceRun(id: String) async throws -> HiringResourceRun {
        try await get("/api/hiring-resources/runs/\(id)")
    }

    func fetchHiringResourceRuns() async throws -> [HiringResourceRun] {
        try await get("/api/hiring-resources/runs/list")
    }

    /// Просит агента остановиться после текущего найденного ресурса — не
    /// обрывает мгновенно, но уже найденное остаётся сохранённым.
    func stopHiringResourceDiscovery(id: String) async throws {
        try await post("/api/hiring-resources/runs/\(id)/stop", body: EmptyBody())
    }

    /// Весь каталог ресурсов найма как JSON — для сохранения в файл и
    /// переноса на другую установку приложения через importHiringResources.
    func exportHiringResources() async throws -> Data {
        try await getRawData("/api/hiring-resources/export")
    }

    /// Принимает содержимое файла экспорта (или голого массива ресурсов) как
    /// есть, без повторного декодирования на устройстве — backend сам
    /// разбирает и валидирует формат.
    func importHiringResources(fileData: Data) async throws -> ImportResourcesResult {
        try await postRawData("/api/hiring-resources/import", data: fileData)
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

    // Скан идёт последовательно по каждому названию должности × каждому
    // источнику и может занять несколько минут (особенно если часть
    // источников недоступна) — backend отвечает сразу id запуска (202),
    // не дожидаясь завершения, чтобы не упереться в таймаут клиента.
    // Приложение опрашивает fetchScanRun(id:), как и для поиска источников.
    struct ScanStarted: Decodable { let scanRunId: String }

    func startScan() async throws -> String {
        let started: ScanStarted = try await post("/api/scan/run", body: EmptyBody())
        return started.scanRunId
    }

    func fetchScanRun(id: String) async throws -> ScanRun {
        try await get("/api/scan/runs/\(id)")
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
        // Отключаем кэш на уровне запроса (а не отдельной URLSession — своя
        // сессия на устройстве почему-то приводила к зависанию запросов).
        // Без этого повторные запросы к одному backend'у через общий
        // URLCache у URLSession.shared надёжно ловят известный краш CFNetwork
        // (SIGSEGV в URLConnectionLoader::loadWithWhatToDo, через
        // continueWithCacheLookupResult).
        var request = URLRequest(url: try makeURL(path, query: query), cachePolicy: .reloadIgnoringLocalCacheData)
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

    /// Для экспорта — тело ответа нужно сохранить как файл как есть, не
    /// декодируя в модель.
    private func getRawData(_ path: String) async throws -> Data {
        let request = try makeRequest(path, method: "GET")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? ""
            throw APIError.server(status: http.statusCode, message: message)
        }
        return data
    }

    /// Для импорта — тело запроса уже готовый JSON (прочитанный из
    /// выбранного пользователем файла), не нужно кодировать заново.
    private func postRawData<Response: Decodable>(_ path: String, data: Data) async throws -> Response {
        var request = try makeRequest(path, method: "POST")
        request.httpBody = data
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
