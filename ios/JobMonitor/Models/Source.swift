import Foundation

struct JobSource: Identifiable, Codable, Equatable {
    let id: String
    let key: String
    let name: String
    let kind: String
    let country: String?
    let enabled: Bool
}
