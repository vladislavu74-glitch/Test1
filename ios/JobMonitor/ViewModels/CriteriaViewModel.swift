import Foundation

@MainActor
final class CriteriaViewModel: ObservableObject {
    @Published var criteria = SearchCriteria(countries: [], regions: [], cities: [], employmentType: nil, salaryMin: nil, remoteOnly: false)
    @Published var isLoading = false
    @Published var isSaving = false
    @Published var errorMessage: String?
    @Published var saved = false

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            criteria = try await client.fetchCriteria()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func save() async {
        isSaving = true
        errorMessage = nil
        saved = false
        do {
            criteria = try await client.updateCriteria(criteria)
            saved = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
