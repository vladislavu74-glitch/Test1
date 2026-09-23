import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var settings: AppSettings
    @StateObject private var badge: BadgeStore
    private let client: APIClient

    init(settings: AppSettings) {
        let client = APIClient(settings: settings)
        self.client = client
        _badge = StateObject(wrappedValue: BadgeStore(client: client))
    }

    var body: some View {
        TabView {
            VacancyListView(client: client, badge: badge)
                .tabItem { Label("Вакансии", systemImage: "list.bullet") }
                .badge(badge.newVacancyCount)

            JobTitlesView(client: client)
                .tabItem { Label("Должности", systemImage: "checklist") }

            HiringResourcesView(client: client)
                .tabItem { Label("Источники", systemImage: "building.2.crop.circle") }

            CriteriaView(client: client)
                .tabItem { Label("Критерии", systemImage: "slider.horizontal.3") }

            SettingsView(client: client)
                .tabItem { Label("Настройки", systemImage: "gearshape") }
        }
    }
}
