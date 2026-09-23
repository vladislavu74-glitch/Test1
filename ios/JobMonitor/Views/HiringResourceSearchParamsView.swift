import SwiftUI

/// Параметры запуска поиска ресурсов найма (раздел 1 требования). Страны —
/// явный список с добавлением/удалением (реальное ограничение поиска, не
/// текст-подсказка для модели), выбираются выпадающим меню из глобального
/// алфавитного справочника (`WorldCountries` — поиск источников не
/// ограничен СНГ, в отличие от справочника вакансий в «Критериях»);
/// остальные списки (города/специализация/языки/исключения) — через запятую.
/// Незаданное поле backend трактует как "не ограничено" и явно фиксирует это
/// как допущение в отчёте запуска.
struct HiringResourceSearchParamsView: View {
    @ObservedObject var viewModel: HiringResourcesViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                if viewModel.selectedCountries.isEmpty {
                    Text("Не ограничено — поиск по всем странам")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.selectedCountries, id: \.self) { country in
                        Text(country)
                    }
                    .onDelete(perform: viewModel.removeCountries)
                }

                let remainingCountries = WorldCountries.all.filter { country in
                    !viewModel.selectedCountries.contains { $0.caseInsensitiveCompare(country) == .orderedSame }
                }
                if !remainingCountries.isEmpty {
                    Menu {
                        ForEach(remainingCountries, id: \.self) { country in
                            Button(country) { viewModel.addCountry(country) }
                        }
                    } label: {
                        Label("Добавить страну", systemImage: "globe")
                    }
                }

                TextField("Города через запятую (необязательно)", text: $viewModel.citiesText)
                Toggle("Включать удалённую работу", isOn: $viewModel.includeRemote)
            } header: {
                Text("География")
            } footer: {
                Text("Ресурс должен соответствовать хотя бы одной из выбранных стран — это обязательное условие отбора, а не просто подсказка.")
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
