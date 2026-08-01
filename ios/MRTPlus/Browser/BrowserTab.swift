import Foundation

final class BrowserTab: Identifiable, ObservableObject {
    let id = UUID()
    let bridge = WebViewBridge()
    @Published var url: URL
    @Published var title: String = ""
    @Published var isLoading = false
    @Published var estimatedProgress: Double = 0
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var addressText: String

    init(url: URL) {
        self.url = url
        self.addressText = url.absoluteString
    }

    func navigate(to url: URL) {
        self.url = url
        self.addressText = url.absoluteString
        bridge.load(url)
    }

    func submitAddress() {
        let trimmed = addressText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let withScheme: String
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            withScheme = trimmed
        } else if trimmed.contains(".") && !trimmed.contains(" ") {
            withScheme = "https://\(trimmed)"
        } else {
            let q = trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmed
            withScheme = "https://yandex.ru/search/?text=\(q)"
        }
        guard let url = URL(string: withScheme) else { return }
        navigate(to: url)
    }
}
