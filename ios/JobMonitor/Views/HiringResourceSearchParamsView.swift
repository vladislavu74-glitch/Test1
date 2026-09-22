import SwiftUI

/// Параметры запуска поиска ресурсов найма (раздел 1 требования). Списки
/// (страны/города/специализация/языки/исключения) — простой ввод через
/// запятую, без отдельного справочника: незаданное поле backend трактует
/// как "не ограничено" и явно фиксирует это как допущение в отчёте запуска.
struct HiringResourceSearchParamsView: View {
    @ObservedObject var viewModel: HiringResourcesViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("География") {
                TextField("Страны через запятую (пусто — не ограничено)", text: $viewModel.countriesText)
                TextField("Города через запятую", text: $viewModel.citiesText)
                Toggle("Включать удалённую работу", isOn: $viewModel.includeRemote)
            }

            Section("Специализация") {
                TextField("Отрасли/профессии через запятую (пусто — любые)", text: $viewModel.specializationText)
            }

            Section("Категории ресурсов") {
                ForEach(ResourceCategory.allCases) { category in
                    Toggle(category.title, isOn: Binding(
                        get: { viewModel.selectedCategories.contains(category) },
                        set: { isOn in
                            if isOn { viewModel.selectedCategories.insert(category) }
                            else { viewModel.selectedCategories.remove(category) }
                        }
                    ))
                }
            }

            Section("Языки") {
                TextField("Языки через запятую (пусто — без ограничения)", text: $viewModel.languagesText)
            }

            Section("Актуальность и объём") {
                Stepper(value: $viewModel.recencyDays, in: 7...365, step: 1) {
                    Text("Публикации за последние \(viewModel.recencyDays) дн.")
                }
                Stepper(value: $viewModel.targetCount, in: 1...200, step: 5) {
                    Text("Требуемое число ресурсов: \(viewModel.targetCount)")
                }
            }

            Section {
                TextField("Например: агрегаторы вакансий, обучение", text: $viewModel.exclusionsText)
            } header: {
                Text("Исключения")
            } footer: {
                Text("Стандартные исключения (резюме соискателей, статьи без деятельности по найму, обучение без подбора, дубли) применяются всегда — здесь можно добавить свои.")
            }

            Section {
                Button {
                    viewModel.startDiscovery()
                    dismiss()
                } label: {
                    Text("Найти ресурсы")
                        .frame(maxWidth: .infinity)
                }
                .disabled(viewModel.selectedCategories.isEmpty || viewModel.isRunning)
            }
        }
        .navigationTitle("Параметры поиска")
        .navigationBarTitleDisplayMode(.inline)
    }
}
