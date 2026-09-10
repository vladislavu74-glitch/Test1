import Foundation

/// Общее для всех вкладок число непросмотренных вакансий — показывается
/// значком на вкладке «Вакансии», отдельно от списка на самом экране.
@MainActor
final class BadgeStore: ObservableObject {
    @Published var newVacancyCount = 0

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func refresh() async {
        guard let summary = try? await client.fetchVacancySummary() else { return }
        newVacancyCount = summary.newCount
    }
}
