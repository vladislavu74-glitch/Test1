import Foundation

struct JobTitle: Identifiable, Codable, Equatable {
    let id: String
    let title: String
    let selected: Bool
}
