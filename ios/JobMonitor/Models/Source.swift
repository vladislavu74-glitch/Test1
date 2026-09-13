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

    var isPromoted: Bool { promotedSourceId != nil }
    var isAgency: Bool { kind == "recruiting_agency" }
}

enum CandidateType: String, CaseIterable, Identifiable {
    case greenhouse
    case lever
    case rss
    case agency

    var id: String { rawValue }

    var title: String {
        switch self {
        case .greenhouse: return "Greenhouse (по boardSlug)"
        case .lever: return "Lever (по boardSlug)"
        case .rss: return "RSS/Atom-лента (по URL)"
        case .agency: return "Кадровое агентство (по адресу сайта)"
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
