import Foundation

@MainActor
final class HiringResourcesViewModel: ObservableObject {
    @Published var resources: [HiringResource] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // Фильтры списка.
    @Published var categoryFilter: ResourceCategory?
    @Published var statusFilter: String? // "confirmed" | "needs_review" | "excluded" | nil (все)

    // Параметры запуска (раздел 1) — простые текстовые поля со списками через
    // запятую, без отдельного справочника стран/городов (тот, что уже есть
    // для критериев вакансий, — для более простого набора полей здесь).
    @Published var countriesText = ""
    @Published var citiesText = ""
    @Published var includeRemote = true
    @Published var specializationText = ""
    @Published var selectedCategories: Set<ResourceCategory> = [
        .recruitingAgency, .hrAgency, .directEmployer, .telegram, .community, .social,
    ]
    @Published var languagesText = ""
    @Published var recencyDays = 90
    @Published var targetCount = 20
    @Published var exclusionsText = ""

    // Статус текущего/последнего запуска — управляет статус-баром.
    @Published var currentRun: HiringResourceRun?
    // Локальный флаг для мгновенной обратной связи по нажатию "Остановить" —
    // сам run.stopRequested подтянется опросом через пару секунд.
    @Published var stopRequestSent = false

    private let client: APIClient
    private var pollTask: Task<Void, Never>?

    init(client: APIClient) {
        self.client = client
    }

    var isRunning: Bool { currentRun?.isRunning ?? false }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            resources = try await client.fetchHiringResources(filter: .init(
                category: categoryFilter?.rawValue,
                status: statusFilter,
                minScore: nil
            ))
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func markAllSeen() async {
        try? await client.markAllHiringResourcesSeen()
        await load()
    }

    private func splitList(_ text: String) -> [String] {
        text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    func startDiscovery() {
        let params = HiringResourceRunParams(
            geography: .init(
                countries: splitList(countriesText),
                cities: splitList(citiesText),
                remote: includeRemote
            ),
            specialization: splitList(specializationText),
            categories: selectedCategories.map(\.rawValue),
            languages: splitList(languagesText),
            recencyDays: recencyDays,
            targetCount: targetCount,
            exclusions: splitList(exclusionsText)
        )

        errorMessage = nil
        stopRequestSent = false
        pollTask?.cancel()
        pollTask = Task {
            do {
                let started = try await client.startHiringResourceDiscovery(params: params)
                await pollRun(id: started.runId)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Просит агента остановиться — уже найденные ресурсы остаются, но
    /// поиск новых прекращается после текущей находки (см. backend README).
    func stopDiscovery() {
        guard let runId = currentRun?.id else { return }
        stopRequestSent = true
        Task {
            do {
                try await client.stopHiringResourceDiscovery(id: runId)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Опрашивает статус запуска каждые пару секунд, пока он не завершится —
    /// backend работает асинхронно и может искать несколько минут, поэтому
    /// единственный HTTP-ответ для статус-бара не подходит. Список ресурсов
    /// обновляется на каждом тике — это и есть промежуточные результаты:
    /// каждый найденный ресурс сохраняется backend'ом сразу, а не одним
    /// пакетом в конце (см. hiringResourceAgent.ts).
    private func pollRun(id: String) async {
        while !Task.isCancelled {
            do {
                let run = try await client.fetchHiringResourceRun(id: id)
                currentRun = run
                await load()
                if !run.isRunning {
                    return
                }
            } catch {
                errorMessage = error.localizedDescription
                return
            }
            try? await Task.sleep(nanoseconds: 3_000_000_000)
        }
    }

    /// Возобновляет отслеживание, если запуск был начат ранее и ещё не
    /// закончился (например, экран был закрыт и снова открыт).
    func resumeTrackingLastRunIfNeeded() {
        guard pollTask == nil else { return }
        pollTask = Task {
            guard let last = try? await client.fetchHiringResourceRuns().first, last.isRunning else { return }
            await pollRun(id: last.id)
        }
    }

    var statusBarText: String? {
        guard let run = currentRun, run.isRunning else { return nil }
        if stopRequestSent || run.stopRequested {
            return "Останавливаем… найдено ресурсов: \(run.confirmedCount + run.needsReviewCount + run.excludedCount)"
        }
        return "Идёт поиск ресурсов… выполнено запросов: \(run.queriesUsed), найдено: \(run.confirmedCount + run.needsReviewCount + run.excludedCount)"
    }
}
