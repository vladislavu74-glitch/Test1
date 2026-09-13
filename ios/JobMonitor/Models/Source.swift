import Foundation

struct JobSource: Identifiable, Codable, Equatable {
    let id: String
    let key: String
    let name: String
    let kind: String
    let country: String?
    let enabled: Bool
    // true — источник появился сам через ежедневное автообнаружение,
    // а не был добавлен вручную.
    let discovered: Bool
}

/// Кандидат в каталоге для автообнаружения (сайт рекрутинговой компании/агентства
/// или доска вакансий), который пользователь добавил, но который ещё не
/// подтверждён ежедневной проверкой.
struct SourceCandidate: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let kind: String
    let country: String?
    let addedAt: Date
    let lastCheckedAt: Date?
    let lastCheckOk: Bool?
    let lastCheckError: String?
    let promotedSourceId: String?

    // Заполняются классификатором для kind == "recruiting_agency" —
    // "pending" | "verified" | "needs_review" | "rejected".
    let verificationStatus: String?
    let score: Int?
    let geography: String?
    let specialization: String?
    let evidenceQuote: String?
    let employerContact: String?
    // "recruiting_agency" | "job_board" | "employer_repository" | "unclear"
    let resourceType: String?

    var isPromoted: Bool { promotedSourceId != nil }
    var isAgency: Bool { kind == "recruiting_agency" }
}

enum CandidateType: String, CaseIterable, Identifiable {
    case site
    case telegram
    case agency
    case rss
    case greenhouse
    case lever

    var id: String { rawValue }

    /// Понятное название на русском для выбора в списке.
    var title: String {
        switch self {
        case .site: return "Сайт компании — сами найдём вакансии"
        case .telegram: return "Канал в Telegram"
        case .agency: return "Кадровое агентство — проверим по критериям"
        case .rss: return "RSS-лента вакансий"
        case .greenhouse: return "Карьерная страница на платформе Greenhouse"
        case .lever: return "Карьерная страница на платформе Lever"
        }
    }

    /// Короткое пояснение под выбором — что именно нужно ввести.
    var hint: String {
        switch self {
        case .site: return "Укажите адрес сайта — мы сами обойдём типовые разделы (вакансии, карьера) и найдём подходящие объявления."
        case .telegram: return "Укажите имя канала без @, например: myjobschannel."
        case .agency: return "Укажите адрес сайта — мы проверим его по критериям кадрового агентства (позиционирование, услуги, кейсы)."
        case .rss: return "Укажите прямую ссылку на RSS/Atom-ленту вакансий."
        case .greenhouse: return "Укажите код компании (boardSlug) — виден в адресе её карьерной страницы: boards.greenhouse.io/<код>."
        case .lever: return "Укажите код компании (boardSlug) — виден в адресе её карьерной страницы: jobs.lever.co/<код>."
        }
    }
}

struct DiscoveryResult: Codable, Equatable {
    let discoveryRunId: String
    let checked: Int
    let promoted: Int
    let errors: [String]
}

struct DiscoveryRun: Codable, Equatable {
    let id: String
    let startedAt: Date
    let finishedAt: Date?
    let trigger: String
    let checked: Int
    let promoted: Int
    let error: String?
}
