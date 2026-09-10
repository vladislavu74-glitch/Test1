import SwiftUI
import SafariServices

/// Открывает реальную ссылку на вакансию во встроенном браузере,
/// не покидая приложение.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
