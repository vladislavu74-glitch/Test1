import Foundation

@MainActor
final class JobTitlesViewModel: ObservableObject {
    @Published var jobTitles: [JobTitle] = []
    @Published var newTitleText = ""
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
            jobTitles = try await client.fetchJobTitles()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func addTitle() async {
        let trimmed = newTitleText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            _ = try await client.addJobTitle(trimmed)
            newTitleText = ""
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setSelected(_ jobTitle: JobTitle, selected: Bool) async {
        do {
            try await client.setJobTitleSelected(id: jobTitle.id, selected: selected)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ jobTitle: JobTitle) async {
        do {
            try await client.deleteJobTitle(id: jobTitle.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
