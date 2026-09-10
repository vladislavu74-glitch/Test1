import SwiftUI

/// Каталог кандидатов для автообнаружения: сайты рекрутинговых компаний и
/// агентств, которые пользователь добавляет сам (по boardSlug ATS-системы
/// или ссылке на RSS-ленту). Каждый день backend проверяет непромотированные
/// записи и, если ресурс реально отдаёт вакансии, сам добавляет его в
/// список активных источников поиска (см. SourcesView).
struct SourceCandidatesView: View {
    @StateObject private var viewModel: SourceCandidatesViewModel

    init(client: APIClient) {
        _viewModel = StateObject(wrappedValue: SourceCandidatesViewModel(client: client))
    }

    var body: some View {
        List {
            Section {
                Picker("Тип", selection: $viewModel.newType) {
                    ForEach(CandidateType.allCases) { type in
                        Text(type.title).tag(type)
                    }
                }
                TextField("Название компании/агентства", text: $viewModel.newName)
                TextField("Страна (необязательно)", text: $viewModel.newCountry)

                switch viewModel.newType {
                case .greenhouse, .lever:
                    TextField("boardSlug (из адреса карьерной страницы)", text: $viewModel.newBoardSlug)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                case .rss:
                    TextField("https://example.com/jobs.rss", text: $viewModel.newFeedUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Button("Добавить в каталог") { Task { await viewModel.addCandidate() } }
                    .disabled(viewModel.newName.trimmingCharacters(in: .whitespaces).isEmpty)
            } header: {
                Text("Новый кандидат")
            } footer: {
                Text("boardSlug для Greenhouse/Lever виден в адресе карьерной страницы: boards.greenhouse.io/<slug> или jobs.lever.co/<slug>.")
            }

            Section {
                if let last = viewModel.lastDiscovery {
                    LabeledContent("Последняя проверка", value: last.startedAt.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Проверено / добавлено", value: "\(last.checked) / \(last.promoted)")
                } else {
                    Text("Автообнаружение ещё не запускалось")
                        .foregroundStyle(.secondary)
                }
                Button {
                    Task { await viewModel.discoverNow() }
                } label: {
                    if viewModel.isDiscovering {
                        ProgressView()
                    } else {
                        Text("Проверить каталог сейчас")
                    }
                }
                .disabled(viewModel.isDiscovering)
            } header: {
                Text("Автообнаружение (ежедневно вместе со сканом)")
            }

            Section {
                ForEach(viewModel.candidates) { candidate in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(candidate.name).font(.headline)
                            Spacer()
                            statusBadge(for: candidate)
                        }
                        if let error = candidate.lastCheckError, !candidate.isPromoted {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                }
                .onDelete { indexSet in
                    for index in indexSet {
                        Task { await viewModel.delete(viewModel.candidates[index]) }
                    }
                }
            } header: {
                Text("Каталог кандидатов")
            }
        }
        .navigationTitle("Автообнаружение")
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

    @ViewBuilder
    private func statusBadge(for candidate: SourceCandidate) -> some View {
        if candidate.isPromoted {
            Label("В источниках", systemImage: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        } else if candidate.lastCheckOk == false {
            Label("Недоступен", systemImage: "xmark.circle")
                .font(.caption)
                .foregroundStyle(.red)
        } else {
            Label("Проверяется", systemImage: "clock")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
