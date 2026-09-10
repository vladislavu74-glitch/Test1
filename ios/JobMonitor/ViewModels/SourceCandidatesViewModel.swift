import Foundation

@MainActor
final class SourceCandidatesViewModel: ObservableObject {
    @Published var candidates: [SourceCandidate] = []
    @Published var isLoading = false
    @Published var isDiscovering = false
    @Published var errorMessage: String?
    @Published var lastDiscovery: DiscoveryRun?

    @Published var newName = ""
    @Published var newCountry = ""
    @Published var newType: CandidateType = .greenhouse
    @Published var newBoardSlug = ""
    @Published var newFeedUrl = ""

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            async let candidatesResult = client.fetchSourceCandidates()
            async let lastResult = client.fetchLastDiscovery()
            candidates = try await candidatesResult
            lastDiscovery = try await lastResult
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func addCandidate() async {
        let trimmedName = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        do {
            switch newType {
            case .greenhouse, .lever:
                let slug = newBoardSlug.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !slug.isEmpty else {
                    errorMessage = "Укажите boardSlug (виден в адресе карьерной страницы компании)."
                    return
                }
                _ = try await client.addSourceCandidate(
                    name: trimmedName,
                    country: newCountry.isEmpty ? nil : newCountry,
                    type: newType,
                    boardSlug: slug,
                    feedUrl: nil
                )
            case .rss:
                let url = newFeedUrl.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !url.isEmpty else {
                    errorMessage = "Укажите ссылку на RSS/Atom-ленту."
                    return
                }
                _ = try await client.addSourceCandidate(
                    name: trimmedName,
                    country: newCountry.isEmpty ? nil : newCountry,
                    type: newType,
                    boardSlug: nil,
                    feedUrl: url
                )
            }
            newName = ""
            newCountry = ""
            newBoardSlug = ""
            newFeedUrl = ""
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ candidate: SourceCandidate) async {
        do {
            try await client.deleteSourceCandidate(id: candidate.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func discoverNow() async {
        isDiscovering = true
        errorMessage = nil
        do {
            _ = try await client.runDiscoveryNow()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        isDiscovering = false
    }
}
