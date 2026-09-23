import Foundation

/// Категории ресурсов найма — см. backend/src/discovery/hiringResourceTypes.ts.
enum ResourceCategory: String, CaseIterable, Identifiable, Codable {
    case recruitingAgency = "recruiting_agency"
    case hrAgency = "hr_agency"
    case directEmployer = "direct_employer"
    case telegram
    case community
    case social
    case jobBoard = "job_board"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .recruitingAgency: return "Рекрутинговое/кадровое агентство"
        case .hrAgency: return "HR-агентство"
        case .directEmployer: return "Прямой работодатель"
        case .telegram: return "Telegram-канал/группа"
        case .community: return "Профессиональное сообщество"
        case .social: return "Социальная сеть"
        case .jobBoard: return "Работный сайт/агрегатор"
        }
    }
}

struct OrganizationRef: Identifiable, Codable, Equatable {
    let id: String
    let name: String
}

struct HiringResource: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let url: String
    let category: String
    let rolesJson: String
    let organizationId: String?
    let organization: OrganizationRef?
    let hiringGeography: String?
    let agencyLocation: String?
    let specialization: String?
    let evidenceSummary: String
    let evidenceUrl: String
    let lastRelevantDate: Date?
    let contactMethod: String?
    let publicContact: String?
    let status: String
    let exclusionReason: String?
    let uncertainties: String?
    let score: Int
    let scoreGeoSpec: Int
    let scoreEvidence: Int
    let scoreRecency: Int
    let scoreContact: Int
    let isNew: Bool
    let isStale: Bool
    let firstSeenAt: Date
    let lastSeenAt: Date
    let checkedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, url, category, organizationId, organization
        case hiringGeography, agencyLocation, specialization
        case evidenceSummary, evidenceUrl, lastRelevantDate, contactMethod, publicContact
        case status, exclusionReason, uncertainties
        case score, scoreGeoSpec, scoreEvidence, scoreRecency, scoreContact
        case isNew, isStale, firstSeenAt, lastSeenAt, checkedAt
        case rolesJson = "roles"
    }

    var roles: [String] {
        guard let data = rolesJson.data(using: .utf8),
              let array = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return array
    }
}

/// Расширенная запись — с полным списком ресурсов той же организации.
struct HiringResourceDetail: Codable {
    let resource: HiringResource
    let siblingResources: [HiringResource]

    init(from decoder: Decoder) throws {
        let decodedResource = try HiringResource(from: decoder)
        resource = decodedResource
        let resourceId = decodedResource.id
        let container = try decoder.container(keyedBy: DetailKeys.self)
        if let org = try container.decodeIfPresent(OrganizationWithResources.self, forKey: .organization) {
            siblingResources = org.resources.filter { $0.id != resourceId }
        } else {
            siblingResources = []
        }
    }

    private enum DetailKeys: String, CodingKey { case organization }
    private struct OrganizationWithResources: Codable {
        let resources: [HiringResource]
    }
}

struct HiringResourceSummary: Codable {
    let newCount: Int
    let staleCount: Int
}

/// Параметры запуска поиска (раздел 1 требования) — отправляются как есть,
/// незаданные списки/поля backend трактует как "не ограничено" и явно
/// фиксирует допущение в отчёте запуска.
struct HiringResourceRunParams: Encodable {
    struct Geography: Encodable {
        var countries: [String]
        var cities: [String]
        var remote: Bool
    }

    var geography: Geography
    var specialization: [String]
    var categories: [String]
    var languages: [String]
    var recencyDays: Int
    var targetCount: Int
    var exclusions: [String]
}

struct StartDiscoveryResponse: Codable {
    let runId: String
}

struct HiringResourceRun: Codable, Identifiable {
    let id: String
    let startedAt: Date
    let finishedAt: Date?
    let trigger: String
    let status: String // "running" | "done" | "stopped" | "error"
    let stopRequested: Bool
    let paramsJson: String
    let confirmedCount: Int
    let needsReviewCount: Int
    let excludedCount: Int
    let organizationCount: Int
    let limitationsJson: String
    let queriesUsed: Int
    let error: String?

    enum CodingKeys: String, CodingKey {
        case id, startedAt, finishedAt, trigger, status, stopRequested
        case paramsJson = "paramsJson"
        case confirmedCount, needsReviewCount, excludedCount, organizationCount
        case limitationsJson = "limitations"
        case queriesUsed, error
    }

    var isRunning: Bool { status == "running" }

    var limitations: [String] {
        guard let data = limitationsJson.data(using: .utf8),
              let array = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return array
    }
}

/// Ответ POST /api/hiring-resources/import.
struct ImportResourcesResult: Codable {
    let total: Int
    let created: Int
    let updated: Int
    let errors: [String]
}
