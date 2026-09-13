import SwiftUI

private func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}

struct CriteriaView: View {
    @StateObject private var viewModel: CriteriaViewModel

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: CriteriaViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            Form {
                GeographyListEditor(title: "Страны", placeholder: "Например: Россия", items: $viewModel.criteria.countries)
                GeographyListEditor(title: "Города", placeholder: "Например: Алматы", items: $viewModel.criteria.cities)

                Section {
                    Text("Если не указать ни одной страны или города — поиск ведётся без ограничения по географии, по всем направлениям.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Критерии поиска")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        hideKeyboard()
                        Task { await viewModel.save() }
                    } label: {
                        if viewModel.isSaving {
                            ProgressView()
                        } else {
                            Text("Сохранить")
                        }
                    }
                    .disabled(viewModel.isSaving)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Готово") { hideKeyboard() }
                }
            }
            .task { await viewModel.load() }
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
            .alert("Сохранено", isPresented: $viewModel.saved) {
                Button("OK", role: .cancel) {}
            }
        }
    }
}

/// Список значений (страны/регионы/города), которые пользователь пополняет
/// по одному — вакансия проходит фильтр, если её location (как его вернул
/// источник) содержит хотя бы одно из перечисленных значений. Пустой
/// список означает "без ограничения по этому полю".
private struct GeographyListEditor: View {
    let title: String
    let placeholder: String
    @Binding var items: [String]

    @State private var newValue = ""

    var body: some View {
        Section(title) {
            ForEach(items, id: \.self) { item in
                Text(item)
            }
            .onDelete { indexSet in
                items.remove(atOffsets: indexSet)
            }

            HStack {
                TextField(placeholder, text: $newValue)
                    .autocorrectionDisabled()
                Button("Добавить") {
                    let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty, !items.contains(trimmed) else { return }
                    items.append(trimmed)
                    newValue = ""
                    hideKeyboard()
                }
                .disabled(newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}
