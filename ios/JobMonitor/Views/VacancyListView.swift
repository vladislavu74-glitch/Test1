import SwiftUI

struct VacancyListView: View {
    @EnvironmentObject private var settings: AppSettings
    @StateObject private var viewModel: VacancyListViewModel
    @State private var selectedURL: URL?

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: VacancyListViewModel(client: client))
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
                .task { await viewModel.load() }
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
                VacancyRow(vacancy: vacancy)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if let url = URL(string: vacancy.url) {
                            selectedURL = url
                        }
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
            }
            .listStyle(.plain)
        }
    }
}

private struct VacancyRow: View {
    let vacancy: Vacancy

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(vacancy.title)
                    .font(.headline)
                Spacer()
                if vacancy.hidden {
                    Image(systemName: "eye.slash")
                        .foregroundStyle(.secondary)
                }
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
                if let salary = vacancy.salaryText, !salary.isEmpty {
                    Text("·")
                    Text(salary)
                }
            }
            .font(.caption)
            .foregroundStyle(.tertiary)
        }
        .opacity(vacancy.hidden ? 0.5 : 1)
        .padding(.vertical, 4)
    }
}

extension URL: Identifiable {
    public var id: String { absoluteString }
}
