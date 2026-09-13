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
                Section("Локация") {
                    TextField("Город/регион", text: Binding(
                        get: { viewModel.criteria.location ?? "" },
                        set: { viewModel.criteria.location = $0.isEmpty ? nil : $0 }
                    ))
                }

                Section("Тип занятости") {
                    TextField("Например: полная занятость", text: Binding(
                        get: { viewModel.criteria.employmentType ?? "" },
                        set: { viewModel.criteria.employmentType = $0.isEmpty ? nil : $0 }
                    ))
                }

                Section("Зарплата") {
                    TextField("Минимальная зарплата (0 — без ограничения)", value: Binding(
                        get: { viewModel.criteria.salaryMin ?? 0 },
                        set: { viewModel.criteria.salaryMin = $0 == 0 ? nil : $0 }
                    ), format: .number)
                        .keyboardType(.numberPad)
                }

                Section {
                    Toggle("Только удалённая работа", isOn: $viewModel.criteria.remoteOnly)
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
