import SwiftUI

/// Список названий должностей, которые пользователь ведёт заранее.
/// Переключатель напротив каждого названия выбирает, используется ли оно
/// в поиске — этот выбор сохраняется на backend'е и переживает перезапуск.
struct JobTitlesView: View {
    @StateObject private var viewModel: JobTitlesViewModel

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: JobTitlesViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Например: iOS Developer", text: $viewModel.newTitleText)
                            .textInputAutocapitalization(.words)
                            .submitLabel(.done)
                            .onSubmit { Task { await viewModel.addTitle() } }
                        Button("Добавить") { Task { await viewModel.addTitle() } }
                            .disabled(viewModel.newTitleText.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } header: {
                    Text("Новое название должности")
                }

                Section {
                    ForEach(viewModel.jobTitles) { jobTitle in
                        Toggle(isOn: Binding(
                            get: { jobTitle.selected },
                            set: { newValue in Task { await viewModel.setSelected(jobTitle, selected: newValue) } }
                        )) {
                            Text(jobTitle.title)
                        }
                    }
                    .onDelete { indexSet in
                        for index in indexSet {
                            let jobTitle = viewModel.jobTitles[index]
                            Task { await viewModel.delete(jobTitle) }
                        }
                    }
                } header: {
                    Text("Ваш список названий — выберите нужные для поиска")
                }
            }
            .navigationTitle("Названия должностей")
            .toolbar { EditButton() }
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
