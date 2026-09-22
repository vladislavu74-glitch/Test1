import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    let client: APIClient

    @State private var lastScan: ScanRun?
    @State private var isLoadingLastScan = false
    @State private var errorMessage: String?
    @State private var isNewBuild = false

    private static let lastSeenBuildKey = "lastSeenBuildCommit"

    private var appVersionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("О приложении") {
                    LabeledContent("Версия", value: appVersionText)
                    HStack {
                        LabeledContent("Сборка", value: BuildInfo.gitCommitHash)
                        if isNewBuild {
                            Text("Обновлено")
                                .font(.caption2.bold())
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.green, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                    LabeledContent("Собрано", value: BuildInfo.builtAt)
                }

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
                            Text("Не удалось проверить эти источники (сайт заблокировал запрос, не настроен ключ доступа и т.п.) — на сами найденные вакансии это не влияет, ошибки только по перечисленным ниже:")
                                .font(.caption)
                                .foregroundStyle(.secondary)
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
            .task {
                await loadLastScan()
                checkForNewBuild()
            }
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

    // Показывает бейдж "Обновлено" один раз после того, как на устройство
    // попала новая сборка (по git-коммиту, зашитому в BuildInfo при
    // компиляции) — сравниваем с последним увиденным коммитом и запоминаем
    // текущий, чтобы бейдж не показывался повторно при следующих открытиях
    // вкладки той же сборкой.
    private func checkForNewBuild() {
        let current = BuildInfo.gitCommitHash
        let previous = UserDefaults.standard.string(forKey: Self.lastSeenBuildKey)
        if previous != current {
            isNewBuild = true
            UserDefaults.standard.set(current, forKey: Self.lastSeenBuildKey)
        }
    }
}
