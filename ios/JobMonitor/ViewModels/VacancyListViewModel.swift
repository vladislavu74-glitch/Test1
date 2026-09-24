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

    /// Показывает локально сохранённый список сразу же (см. DiskCache), не
    /// дожидаясь ответа backend'а — VPS отвечает не мгновенно, и держать
    /// пустой экран/спиннер на это время незачем, если у нас уже есть, что
    /// показать с прошлого раза. Свежие данные подменяют список и кэш, как
    /// только приходят; если запрос не удался, а кэш уже показан — не пугаем
    /// ошибкой поверх того, что и так видно, просто оставляем как есть.
    func load() async {
        if vacancies.isEmpty, let cached = DiskCache.load([Vacancy].self, key: cacheKey(for: filter)) {
            vacancies = cached
        }
        isLoading = true
        errorMessage = nil
        do {
            let fresh = try await client.fetchVacancies(filter: filter)
            vacancies = fresh
            DiskCache.save(fresh, key: cacheKey(for: filter))
        } catch {
            if vacancies.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
        await badge.refresh()
    }

    private func cacheKey(for filter: VacancyFilter) -> String { "vacancies_\(filter.rawValue)" }

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

    /// Запускает скан и опрашивает его статус до завершения — сам скан идёт
    /// последовательно по каждой должности × каждому источнику и может
    /// занять несколько минут, поэтому backend отвечает сразу (см.
    /// APIClient.startScan) и результат нужно дожидаться отдельно, а не
    /// одним HTTP-ответом.
    func runScanNow() async {
        isScanning = true
        errorMessage = nil
        do {
            let runId = try await client.startScan()
            while true {
                let run = try await client.fetchScanRun(id: runId)
                if !run.isRunning {
                    if let error = run.error, !error.isEmpty {
                        errorMessage = error
                    }
                    break
                }
                try await Task.sleep(nanoseconds: 3_000_000_000)
            }
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        isScanning = false
    }
}
