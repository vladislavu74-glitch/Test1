import Foundation

@MainActor
final class SourcesViewModel: ObservableObject {
    @Published var sources: [JobSource] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            sources = try await client.fetchSources()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func setEnabled(_ source: JobSource, enabled: Bool) async {
        do {
            try await client.setSourceEnabled(id: source.id, enabled: enabled)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
