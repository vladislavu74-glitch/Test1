import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var settings: AppSettings
    private let client: APIClient

    init(settings: AppSettings) {
        self.client = APIClient(settings: settings)
    }

    var body: some View {
        TabView {
            VacancyListView(client: client)
                .tabItem { Label("Вакансии", systemImage: "list.bullet") }

            JobTitlesView(client: client)
                .tabItem { Label("Должности", systemImage: "checklist") }

            SourcesView(client: client)
                .tabItem { Label("Источники", systemImage: "server.rack") }

            CriteriaView(client: client)
                .tabItem { Label("Критерии", systemImage: "slider.horizontal.3") }

            SettingsView(client: client)
                .tabItem { Label("Настройки", systemImage: "gearshape") }
        }
    }
}
