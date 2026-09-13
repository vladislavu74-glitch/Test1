import SwiftUI

/// Список названий должностей, которые пользователь ведёт заранее.
/// Переключатель напротив каждого названия выбирает, используется ли оно
/// в поиске — этот выбор сохраняется на backend'е и переживает перезапуск.
struct JobTitlesView: View {
    @StateObject private var viewModel: JobTitlesViewModel
    @State private var renamingJobTitle: JobTitle?
    @State private var renameText = ""

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
                        .swipeActions(edge: .leading) {
                            Button {
                                renameText = jobTitle.title
                                renamingJobTitle = jobTitle
                            } label: {
                                Label("Переименовать", systemImage: "pencil")
                            }
                            .tint(.blue)
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
            .alert(
                "Переименовать должность",
                isPresented: Binding(
                    get: { renamingJobTitle != nil },
                    set: { if !$0 { renamingJobTitle = nil } }
                )
            ) {
                TextField("Название должности", text: $renameText)
                    .textInputAutocapitalization(.words)
                Button("Отмена", role: .cancel) { renamingJobTitle = nil }
                Button("Сохранить") {
                    if let jobTitle = renamingJobTitle {
                        Task { await viewModel.rename(jobTitle, to: renameText) }
                    }
                    renamingJobTitle = nil
                }
            }
        }
    }
}
