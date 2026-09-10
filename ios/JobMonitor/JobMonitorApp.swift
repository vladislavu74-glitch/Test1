import SwiftUI

@main
struct JobMonitorApp: App {
    @StateObject private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            RootTabView(settings: settings)
                .environmentObject(settings)
        }
    }
}
