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
                Section {
                    Text("Сначала выберите страну — под ней появится список городов именно этой страны.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Страны") {
                    ForEach(GeographyDirectory.countries, id: \.self) { country in
                        CheckableRow(title: country, isChecked: viewModel.criteria.countries.contains(country)) {
                            toggleCountry(country)
                        }
                    }
                    CustomValueEditor(placeholder: "Своя страна (если нет в списке)") { value in
                        guard !viewModel.criteria.countries.contains(value) else { return }
                        viewModel.criteria.countries.append(value)
                    }
                    // Страны, добавленные вручную и не входящие в справочник —
                    // показываем отдельно, иначе их негде было бы снять.
                    let customCountries = viewModel.criteria.countries.filter { !GeographyDirectory.countries.contains($0) }
                    ForEach(customCountries, id: \.self) { country in
                        CheckableRow(title: country, isChecked: true) {
                            toggleCountry(country)
                        }
                    }
                }

                ForEach(viewModel.criteria.countries, id: \.self) { country in
                    Section("Города — \(country)") {
                        let directoryCities = GeographyDirectory.cities(for: country)
                        if directoryCities.isEmpty {
                            Text("Для этой страны нет справочника городов — добавьте нужные вручную ниже.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        ForEach(directoryCities, id: \.self) { city in
                            CheckableRow(title: city, isChecked: viewModel.criteria.cities.contains(city)) {
                                toggleCity(city)
                            }
                        }
                        CustomValueEditor(placeholder: "Свой город (если нет в списке)") { value in
                            guard !viewModel.criteria.cities.contains(value) else { return }
                            viewModel.criteria.cities.append(value)
                        }
                    }
                }

                // Города, добавленные вручную и не входящие в справочник ни одной
                // страны из списка — показываем отдельно, иначе их негде снять.
                let allDirectoryCities = Set(GeographyDirectory.citiesByCountry.values.flatMap { $0 })
                let customCities = viewModel.criteria.cities.filter { !allDirectoryCities.contains($0) }
                if !customCities.isEmpty {
                    Section("Свои города") {
                        ForEach(customCities, id: \.self) { city in
                            CheckableRow(title: city, isChecked: true) {
                                toggleCity(city)
                            }
                        }
                    }
                }

                Section {
                    Text("Если не выбрать ни одной страны или города — поиск ведётся без ограничения по географии, по всем направлениям.")
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

    private func toggleCountry(_ country: String) {
        if let index = viewModel.criteria.countries.firstIndex(of: country) {
            viewModel.criteria.countries.remove(at: index)
            // Убираем и города этой страны — без страны они "повисли бы"
            // в отдельном разделе, который больше не показывается.
            let cities = Set(GeographyDirectory.cities(for: country))
            viewModel.criteria.cities.removeAll { cities.contains($0) }
        } else {
            viewModel.criteria.countries.append(country)
        }
    }

    private func toggleCity(_ city: String) {
        if let index = viewModel.criteria.cities.firstIndex(of: city) {
            viewModel.criteria.cities.remove(at: index)
        } else {
            viewModel.criteria.cities.append(city)
        }
    }
}

private struct CheckableRow: View {
    let title: String
    let isChecked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .foregroundStyle(.primary)
                Spacer()
                if isChecked {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}

private struct CustomValueEditor: View {
    let placeholder: String
    let onAdd: (String) -> Void

    @State private var newValue = ""

    var body: some View {
        HStack {
            TextField(placeholder, text: $newValue)
                .autocorrectionDisabled()
            Button("Добавить") {
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                onAdd(trimmed)
                newValue = ""
                hideKeyboard()
            }
            .disabled(newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
