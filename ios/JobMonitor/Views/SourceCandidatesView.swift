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
                case .agency:
                    TextField("https://example.com", text: $viewModel.newAgencyUrl)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Button("Добавить в каталог") { Task { await viewModel.addCandidate() } }
                    .disabled(viewModel.newName.trimmingCharacters(in: .whitespaces).isEmpty)
            } header: {
                Text("Новый кандидат")
            } footer: {
                Text("boardSlug для Greenhouse/Lever виден в адресе карьерной страницы: boards.greenhouse.io/<slug> или jobs.lever.co/<slug>. Для «Кадровое агентство» достаточно адреса сайта — backend сам проверит его по критериям (позиционирование, услуги для работодателей, форма заявки, условия, кейсы) и определит, агентство ли это, доска объявлений или репозиторий вакансий работодателя.")
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
            } footer: {
                if viewModel.candidates.isEmpty {
                    Text("Каталог пуст, поэтому проверять нечего — «Проверить каталог сейчас» классифицирует только сайты, которые вы сами добавили выше по ссылке. Автоматического поиска новых сайтов в интернете нет (для этого нужен платный Search API), сама кнопка ничего не найдёт, пока список кандидатов пуст.")
                }
            }

            Section {
                ForEach(viewModel.candidates) { candidate in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(candidate.name).font(.headline)
                            Spacer()
                            statusBadge(for: candidate)
                        }
                        if candidate.isAgency {
                            agencyDetails(for: candidate)
                        }
                        if let error = candidate.lastCheckError, !candidate.isPromoted {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                    .padding(.vertical, 2)
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
        } else if candidate.isAgency, let status = candidate.verificationStatus, status != "pending" {
            agencyStatusLabel(status)
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

    @ViewBuilder
    private func agencyStatusLabel(_ status: String) -> some View {
        switch status {
        case "verified":
            Label("Подтверждено", systemImage: "checkmark.seal.fill")
                .font(.caption)
                .foregroundStyle(.green)
        case "needs_review":
            Label("Требует проверки", systemImage: "questionmark.circle")
                .font(.caption)
                .foregroundStyle(.orange)
        case "rejected":
            Label("Не подходит", systemImage: "xmark.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
        default:
            Label("Проверяется", systemImage: "clock")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func agencyDetails(for candidate: SourceCandidate) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let resourceType = candidate.resourceType {
                Text(resourceTypeLabel(resourceType))
                    .font(.caption2.bold())
                    .foregroundStyle(.blue)
            }
            if let geography = candidate.geography, !geography.isEmpty {
                Text("География: \(geography)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let specialization = candidate.specialization, !specialization.isEmpty {
                Text("Специализация: \(specialization)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let quote = candidate.evidenceQuote, !quote.isEmpty {
                Text("«…\(quote)…»")
                    .font(.caption)
                    .italic()
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let contact = candidate.employerContact, !contact.isEmpty {
                Text("Контакт: \(contact)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func resourceTypeLabel(_ type: String) -> String {
        switch type {
        case "recruiting_agency": return "Кадровое агентство"
        case "job_board": return "Доска объявлений / база вакансий"
        case "employer_repository": return "Репозиторий вакансий работодателя"
        default: return "Требует уточнения"
        }
    }
}
