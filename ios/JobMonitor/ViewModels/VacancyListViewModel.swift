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
    private let badge: BadgeStore

    init(client: APIClient, badge: BadgeStore) {
        self.client = client
        self.badge = badge
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
        await badge.refresh()
    }

    /// Вызывается при открытии вакансии (тап по названию/кнопке) — снимает
    /// значок "Новое" именно с неё, не трогая остальной список.
    func markSeen(_ vacancy: Vacancy) async {
        guard vacancy.isNew else { return }
        do {
            try await client.markVacancySeen(id: vacancy.id)
            if let index = vacancies.firstIndex(where: { $0.id == vacancy.id }) {
                vacancies[index].isNew = false
            }
            await badge.refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
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

    func clearAll() async {
        errorMessage = nil
        do {
            try await client.clearAllVacancies()
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
