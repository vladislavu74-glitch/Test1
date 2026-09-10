import SwiftUI

struct SourcesView: View {
    @StateObject private var viewModel: SourcesViewModel

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: SourcesViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List(viewModel.sources) { source in
                Toggle(isOn: Binding(
                    get: { source.enabled },
                    set: { newValue in Task { await viewModel.setEnabled(source, enabled: newValue) } }
                )) {
                    VStack(alignment: .leading) {
                        Text(source.name)
                        if let country = source.country {
                            Text(country)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Источники")
            .overlay {
                if viewModel.isLoading && viewModel.sources.isEmpty {
                    ProgressView()
                } else if viewModel.sources.isEmpty {
                    EmptyStateView(
                        systemImage: "server.rack",
                        title: "Нет источников",
                        message: "Источники добавляются на backend'е и появятся здесь автоматически."
                    )
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
