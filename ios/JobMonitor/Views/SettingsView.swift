import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    let client: APIClient

    @State private var lastScan: ScanRun?
    @State private var isLoadingLastScan = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://192.168.1.10:4000", text: $settings.baseURLString)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("API-токен", text: $settings.apiToken)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Backend")
                } footer: {
                    Text("Адрес и токен должны совпадать с API_AUTH_TOKEN в .env backend'а. При первом запуске на телефоне через кабель обычно используется локальный IP компьютера с backend'ом в той же Wi-Fi-сети.")
                }

                Section("Последний скан") {
                    if isLoadingLastScan {
                        ProgressView()
                    } else if let lastScan {
                        let startedAtText: String = lastScan.startedAt.formatted(date: .abbreviated, time: .shortened)
                        let triggerText: String = lastScan.trigger == "cron" ? "по расписанию" : "вручную"
                        let newVacanciesText: String = "\(lastScan.newVacancies)"
                        let emailSentText: String = lastScan.emailSent ? "да" : "нет"
                        LabeledContent("Запущен", value: startedAtText)
                        LabeledContent("Триггер", value: triggerText)
                        LabeledContent("Новых вакансий", value: newVacanciesText)
                        LabeledContent("Письмо отправлено", value: emailSentText)
                        if let error = lastScan.error, !error.isEmpty {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    } else {
                        Text("Ещё не запускался")
                            .foregroundStyle(.secondary)
                    }

                    Button("Обновить") { Task { await loadLastScan() } }
                        .disabled(!settings.isConfigured)
                }
            }
            .navigationTitle("Настройки")
            .task { await loadLastScan() }
            .alert(
                "Ошибка",
                isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func loadLastScan() async {
        guard settings.isConfigured else { return }
        isLoadingLastScan = true
        do {
            lastScan = try await client.fetchLastScan()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoadingLastScan = false
    }
}
