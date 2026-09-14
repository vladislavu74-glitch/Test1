import SwiftUI

private func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}

private enum CustomEntryTarget: Identifiable {
    case country
    case city(country: String)

    var id: String {
        switch self {
        case .country: return "country"
        case .city(let country): return "city-\(country)"
        }
    }
}

struct CriteriaView: View {
    @StateObject private var viewModel: CriteriaViewModel
    @State private var customEntryTarget: CustomEntryTarget?
    @State private var customEntryText = ""

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: CriteriaViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Выберите страну из выпадающего списка — под ней появится выпадающий список городов именно этой страны.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Страны") {
                    ForEach(viewModel.criteria.countries, id: \.self) { country in
                        Text(country)
                    }
                    .onDelete { indexSet in
                        for country in indexSet.map({ viewModel.criteria.countries[$0] }) {
                            removeCountry(country)
                        }
                    }

                    Menu {
                        ForEach(availableCountries, id: \.self) { country in
                            Button(country) { addCountry(country) }
                        }
                        Button("Другое…") {
                            customEntryText = ""
                            customEntryTarget = .country
                        }
                    } label: {
                        Label("Добавить страну", systemImage: "chevron.down.circle")
                    }
                }

                ForEach(viewModel.criteria.countries, id: \.self) { country in
                    Section("Города — \(country)") {
                        let citiesHere = GeographyDirectory.cities(for: country).filter { viewModel.criteria.cities.contains($0) }
                        ForEach(citiesHere, id: \.self) { city in
                            Text(city)
                        }
                        .onDelete { indexSet in
                            for city in indexSet.map({ citiesHere[$0] }) {
                                removeCity(city)
                            }
                        }

                        Menu {
                            ForEach(availableCities(for: country), id: \.self) { city in
                                Button(city) { addCity(city) }
                            }
                            Button("Другое…") {
                                customEntryText = ""
                                customEntryTarget = .city(country: country)
                            }
                        } label: {
                            Label("Добавить город", systemImage: "chevron.down.circle")
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
                            Text(city)
                        }
                        .onDelete { indexSet in
                            for city in indexSet.map({ customCities[$0] }) {
                                removeCity(city)
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
            .alert(
                customEntryAlertTitle,
                isPresented: Binding(
                    get: { customEntryTarget != nil },
                    set: { if !$0 { customEntryTarget = nil } }
                )
            ) {
                TextField("Название", text: $customEntryText)
                    .autocorrectionDisabled()
                Button("Отмена", role: .cancel) { customEntryTarget = nil }
                Button("Добавить") {
                    let trimmed = customEntryText.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { customEntryTarget = nil; return }
                    switch customEntryTarget {
                    case .country: addCountry(trimmed)
                    case .city: addCity(trimmed)
                    case nil: break
                    }
                    customEntryTarget = nil
                }
            }
        }
    }

    private var customEntryAlertTitle: String {
        switch customEntryTarget {
        case .country: return "Своя страна"
        case .city(let country): return "Свой город (\(country))"
        case nil: return ""
        }
    }

    private var availableCountries: [String] {
        GeographyDirectory.countries.filter { !viewModel.criteria.countries.contains($0) }
    }

    private func availableCities(for country: String) -> [String] {
        GeographyDirectory.cities(for: country).filter { !viewModel.criteria.cities.contains($0) }
    }

    private func addCountry(_ country: String) {
        guard !viewModel.criteria.countries.contains(country) else { return }
        viewModel.criteria.countries.append(country)
    }

    private func removeCountry(_ country: String) {
        viewModel.criteria.countries.removeAll { $0 == country }
        // Убираем и города этой страны — без страны они "повисли бы" в
        // разделе, который больше не показывается.
        let cities = Set(GeographyDirectory.cities(for: country))
        viewModel.criteria.cities.removeAll { cities.contains($0) }
    }

    private func addCity(_ city: String) {
        guard !viewModel.criteria.cities.contains(city) else { return }
        viewModel.criteria.cities.append(city)
    }

    private func removeCity(_ city: String) {
        viewModel.criteria.cities.removeAll { $0 == city }
    }
}
