import Foundation

struct SearchCriteria: Codable, Equatable {
    var countries: [String]
    var cities: [String]
}

struct ScanRun: Codable, Equatable {
    let id: String
    let startedAt: Date
    let finishedAt: Date?
    let trigger: String
    let newVacancies: Int
    let emailSent: Bool
    let error: String?
}

struct ScanResult: Codable, Equatable {
    let scanRunId: String
    let newVacancyCount: Int
    let emailSent: Bool
    let errors: [String]
}
