import Foundation

@MainActor
final class VacancyListViewModel: ObservableObject {
    @Published var vacancies: [Vacancy] = []
    @Published var filter: VacancyFilter = .active {
        didSet { UserDefaults.standard.set(filter.rawValue, forKey: Self.filterKey) }
    }
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isScanning = false

    private static let filterKey = "vacancyListFilter"
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
        if let saved = UserDefaults.standard.string(forKey: Self.filterKey),
           let restored = VacancyFilter(rawValue: saved) {
            self.filter = restored
        }
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            vacancies = try await client.fetchVacancies(filter: filter)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func hide(_ vacancy: Vacancy) async {
        await mutate(vacancy) { try await self.client.hideVacancy(id: vacancy.id) }
    }

    func unhide(_ vacancy: Vacancy) async {
        await mutate(vacancy) { try await self.client.unhideVacancy(id: vacancy.id) }
    }

    private func mutate(_ vacancy: Vacancy, _ action: () async throws -> Void) async {
        do {
            try await action()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func runScanNow() async {
        isScanning = true
        errorMessage = nil
        do {
            _ = try await client.runScan()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        isScanning = false
    }
}
