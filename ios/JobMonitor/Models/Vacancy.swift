import Foundation

struct Vacancy: Identifiable, Codable, Equatable {
    let id: String
    let title: String
    let company: String?
    let url: String
    let location: String?
    let salaryText: String?
    let publishedAt: Date
    let sourceName: String
    let hidden: Bool
    let isNew: Bool
}

struct VacancySummary: Codable, Equatable {
    let newCount: Int
}

enum VacancyFilter: String, CaseIterable, Identifiable {
    case active
    case hidden
    case all

    var id: String { rawValue }

    var title: String {
        switch self {
        case .active: return "Активные"
        case .hidden: return "Скрытые"
        case .all: return "Все"
        }
    }
}
