import SwiftUI
import UniformTypeIdentifiers

/// Обёртка над сырыми JSON-байтами для `.fileExporter` — используется для
/// сохранения экспорта каталога ресурсов найма файлом (см.
/// HiringResourcesViewModel.exportResources).
struct JSONFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    static var writableContentTypes: [UTType] { [.json] }

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
