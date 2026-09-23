import SwiftUI

/// Список найденных и проверенных ресурсов найма (сайты, каналы, сообщества,
/// соцстраницы) — единица результата ресурс, а не вакансия. Поиск запускается
/// только вручную кнопкой (см. HiringResourceSearchParamsView), не по
/// расписанию — это дорогая по токенам ИИ-операция.
struct HiringResourcesView: View {
    @StateObject private var viewModel: HiringResourcesViewModel

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: HiringResourcesViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List {
                if let statusText = viewModel.statusBarText {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text(statusText)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("Остановить", role: .destructive) {
                                viewModel.stopDiscovery()
                            }
                            .font(.footnote)
                            .disabled(viewModel.stopRequestSent || (viewModel.currentRun?.stopRequested ?? false))
                        }
                    }
                } else if let run = viewModel.currentRun, run.status == "error" {
                    Section {
                        Label(run.error ?? "Поиск завершился с ошибкой", systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                } else if let run = viewModel.currentRun, run.status == "done" || run.status == "stopped" {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(run.status == "stopped" ? "Остановлено пользователем" : "Готово"): подтверждено \(run.confirmedCount), на проверке \(run.needsReviewCount), исключено \(run.excludedCount), организаций \(run.organizationCount)")
                                .font(.footnote)
                            ForEach(run.limitations, id: \.self) { limitation in
                                Text("⚠️ \(limitation)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section {
                    NavigationLink {
                        HiringResourceSearchParamsView(viewModel: viewModel)
                    } label: {
                        Label(viewModel.isRunning ? "Поиск выполняется…" : "Найти ресурсы найма", systemImage: "sparkle.magnifyingglass")
                    }
                    .disabled(viewModel.isRunning)

                    Picker("Статус", selection: $viewModel.statusFilter) {
                        Text("Все").tag(String?.none)
                        Text("Подтверждено").tag(String?.some("confirmed"))
                        Text("Требует проверки").tag(String?.some("needs_review"))
                        Text("Исключено").tag(String?.some("excluded"))
                    }
                    .onChange(of: viewModel.statusFilter) { _ in Task { await viewModel.load() } }

                    Picker("Категория", selection: $viewModel.categoryFilter) {
                        Text("Все").tag(ResourceCategory?.none)
                        ForEach(ResourceCategory.allCases) { category in
                            Text(category.title).tag(ResourceCategory?.some(category))
                        }
                    }
                    .onChange(of: viewModel.categoryFilter) { _ in Task { await viewModel.load() } }
                }

                Section("Ресурсы (\(viewModel.resources.count))") {
                    ForEach(viewModel.resources) { resource in
                        resourceRow(resource)
                    }
                }
            }
            .navigationTitle("Ресурсы найма")
            .overlay {
                if viewModel.isLoading && viewModel.resources.isEmpty {
                    ProgressView()
                }
            }
            .task {
                await viewModel.load()
                viewModel.resumeTrackingLastRunIfNeeded()
            }
            .refreshable { await viewModel.load() }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Просмотрено") { Task { await viewModel.markAllSeen() } }
                }
            }
            .alert(
                "Ошибка",
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    @ViewBuilder
    private func resourceRow(_ resource: HiringResource) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(resource.name).font(.headline)
                if resource.isNew {
                    tag("Новое", color: .blue)
                }
                if resource.isStale {
                    tag("Неактуально", color: .orange)
                }
                Spacer()
                Text("\(resource.score)")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            statusBadge(resource.status, reason: resource.exclusionReason)

            Text(categoryTitle(resource.category))
                .font(.caption2.bold())
                .foregroundStyle(.blue)

            if let geo = resource.hiringGeography, !geo.isEmpty {
                Text("География найма: \(geo)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let spec = resource.specialization, !spec.isEmpty {
                Text("Специализация: \(spec)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(resource.evidenceSummary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)

            Link(resource.evidenceUrl, destination: URL(string: resource.evidenceUrl) ?? URL(string: resource.url)!)
                .font(.caption)
                .lineLimit(1)

            if let contact = resource.contactMethod ?? resource.publicContact, !contact.isEmpty {
                Text("Контакт: \(contact)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let uncertainties = resource.uncertainties, !uncertainties.isEmpty {
                Text("Неопределённости: \(uncertainties)")
                    .font(.caption)
                    .italic()
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func tag(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    @ViewBuilder
    private func statusBadge(_ status: String, reason: String?) -> some View {
        switch status {
        case "confirmed":
            Label("Подтверждён", systemImage: "checkmark.seal.fill")
                .font(.caption)
                .foregroundStyle(.green)
        case "needs_review":
            Label("Требует проверки", systemImage: "questionmark.circle")
                .font(.caption)
                .foregroundStyle(.orange)
        case "excluded":
            Label(reason ?? "Исключён", systemImage: "xmark.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
        default:
            EmptyView()
        }
    }

    private func categoryTitle(_ raw: String) -> String {
        ResourceCategory(rawValue: raw)?.title ?? raw
    }
}
