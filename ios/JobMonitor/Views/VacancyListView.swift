import SwiftUI

struct VacancyListView: View {
    @EnvironmentObject private var settings: AppSettings
    @StateObject private var viewModel: VacancyListViewModel
    @State private var selectedURL: URL?
    @State private var showClearConfirmation = false

    init(client: APIClient, badge: BadgeStore) {
        _viewModel = StateObject(wrappedValue: VacancyListViewModel(client: client, badge: badge))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Вакансии")
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            Task { await viewModel.runScanNow() }
                        } label: {
                            if viewModel.isScanning {
                                ProgressView()
                            } else {
                                Label("Искать сейчас", systemImage: "arrow.clockwise")
                            }
                        }
                        .disabled(viewModel.isScanning || !settings.isConfigured)
                    }
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button(role: .destructive) {
                            showClearConfirmation = true
                        } label: {
                            Image(systemName: "trash")
                        }
                        .disabled(viewModel.vacancies.isEmpty)
                    }
                }
                .confirmationDialog(
                    "Удалить все найденные вакансии без возможности восстановления?",
                    isPresented: $showClearConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Очистить всё", role: .destructive) {
                        Task { await viewModel.clearAll() }
                    }
                    Button("Отмена", role: .cancel) {}
                }
                .safeAreaInset(edge: .top) {
                    Picker("Фильтр", selection: $viewModel.filter) {
                        ForEach(VacancyFilter.allCases) { filter in
                            Text(filter.title).tag(filter)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.top, 4)
                    .background(.bar)
                }
                .onChange(of: viewModel.filter) { _ in
                    Task { await viewModel.load() }
                }
                .refreshable { await viewModel.load() }
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
                .sheet(item: $selectedURL) { url in
                    SafariView(url: url)
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if !settings.isConfigured {
            EmptyStateView(
                systemImage: "gearshape",
                title: "Backend не настроен",
                message: "Укажите адрес сервера и API-токен во вкладке «Настройки»."
            )
        } else if viewModel.isLoading && viewModel.vacancies.isEmpty {
            ProgressView()
        } else if viewModel.vacancies.isEmpty {
            EmptyStateView(
                systemImage: "tray",
                title: "Пусто",
                message: "Нет вакансий по текущему фильтру. Настройте названия должностей и источники, затем нажмите «Искать сейчас»."
            )
        } else {
            List(viewModel.vacancies) { vacancy in
                VacancyRow(vacancy: vacancy) {
                    if let url = URL(string: vacancy.url) {
                        selectedURL = url
                    }
                    Task { await viewModel.markSeen(vacancy) }
                }
                .swipeActions(edge: .trailing) {
                    if vacancy.hidden {
                        Button {
                            Task { await viewModel.unhide(vacancy) }
                        } label: {
                            Label("Показать", systemImage: "eye")
                        }
                        .tint(.blue)
                    } else {
                        Button(role: .destructive) {
                            Task { await viewModel.hide(vacancy) }
                        } label: {
                            Label("Скрыть", systemImage: "eye.slash")
                        }
                    }
                }
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
            .listStyle(.plain)
        }
    }
}

private struct VacancyRow: View {
    let vacancy: Vacancy
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Button(action: onOpen) {
                    Text(vacancy.title)
                        .font(.headline)
                        .foregroundStyle(Color.accentColor)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                if vacancy.isNew && !vacancy.hidden {
                    Text("Новое")
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.accentColor, in: Capsule())
                        .foregroundStyle(.white)
                }
                Spacer(minLength: 0)
                if vacancy.hidden {
                    Image(systemName: "eye.slash")
                        .foregroundStyle(.secondary)
                }
            }

            if let salary = vacancy.salaryText, !salary.isEmpty {
                Text(salary)
                    .font(.subheadline)
            }

            HStack(spacing: 4) {
                if let company = vacancy.company, !company.isEmpty {
                    Text(company)
                }
                if let location = vacancy.location, !location.isEmpty {
                    Text("·")
                    Text(location)
                }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)

            HStack(spacing: 4) {
                Text(vacancy.sourceName)
                Text("·")
                Text(vacancy.publishedAt, style: .relative)
            }
            .font(.caption)
            .foregroundStyle(.tertiary)

            Button(action: onOpen) {
                Text("Посмотреть вакансию")
                    .font(.subheadline.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
            .background(Color.accentColor.opacity(0.15), in: Capsule())
            .foregroundStyle(Color.accentColor)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
        )
        .opacity(vacancy.hidden ? 0.5 : 1)
        .contentShape(Rectangle())
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}
