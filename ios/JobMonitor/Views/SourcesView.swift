import SwiftUI

struct SourcesView: View {
    @StateObject private var viewModel: SourcesViewModel
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
        _viewModel = StateObject(wrappedValue: SourcesViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        SourceCandidatesView(client: client)
                    } label: {
                        Label("Автообнаружение новых источников", systemImage: "sparkle.magnifyingglass")
                    }
                } footer: {
                    Text("Добавляйте сайты рекрутинговых компаний/агентств — backend ежедневно проверяет их и сам включает в список ниже, если они реально отдают вакансии.")
                }

                Section("Источники") {
                    ForEach(viewModel.sources) { source in
                        Toggle(isOn: Binding(
                            get: { source.enabled },
                            set: { newValue in Task { await viewModel.setEnabled(source, enabled: newValue) } }
                        )) {
                            VStack(alignment: .leading) {
                                HStack(spacing: 6) {
                                    Text(source.name)
                                    if source.discovered {
                                        Text("авто")
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 5)
                                            .padding(.vertical, 1)
                                            .background(Color.secondary.opacity(0.2), in: Capsule())
                                    }
                                }
                                if let country = source.country {
                                    Text(country)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Источники")
            .overlay {
                if viewModel.isLoading && viewModel.sources.isEmpty {
                    ProgressView()
                }
            }
            .task { await viewModel.load() }
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
        }
    }
}
