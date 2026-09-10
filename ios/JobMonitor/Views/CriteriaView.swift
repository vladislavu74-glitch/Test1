import SwiftUI

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

                Section {
                    Button {
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
            }
            .navigationTitle("Критерии поиска")
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
