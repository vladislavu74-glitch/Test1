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
    @Published var newType: CandidateType = .site
    @Published var newBoardSlug = ""
    @Published var newFeedUrl = ""
    @Published var newUrl = ""
    @Published var newChannelUsername = ""

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
                    errorMessage = "Укажите код компании (boardSlug)."
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
            case .agency, .site:
                let url = newUrl.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !url.isEmpty else {
                    errorMessage = "Укажите адрес сайта."
                    return
                }
                _ = try await client.addSourceCandidate(
                    name: trimmedName,
                    country: newCountry.isEmpty ? nil : newCountry,
                    type: newType,
                    boardSlug: nil,
                    feedUrl: nil,
                    url: url
                )
            case .telegram:
                let username = newChannelUsername.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !username.isEmpty else {
                    errorMessage = "Укажите имя канала (без @)."
                    return
                }
                _ = try await client.addSourceCandidate(
                    name: trimmedName,
                    country: newCountry.isEmpty ? nil : newCountry,
                    type: newType,
                    boardSlug: nil,
                    feedUrl: nil,
                    channelUsername: username
                )
            }
            newName = ""
            newCountry = ""
            newBoardSlug = ""
            newFeedUrl = ""
            newUrl = ""
            newChannelUsername = ""
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
