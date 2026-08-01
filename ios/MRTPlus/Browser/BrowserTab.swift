import Foundation

@MainActor
final class BrowserTab: Identifiable, ObservableObject {
    nonisolated static let homeURL = URL(string: "mrtplus://home")!

    let id = UUID()
    let bridge = WebViewBridge()
    @Published var url: URL
    @Published var title: String = ""
    @Published var isLoading = false
    @Published var estimatedProgress: Double = 0
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var addressText: String

    var isHome: Bool {
        url.scheme == "mrtplus" && url.host == "home"
    }

    init(url: URL = BrowserTab.homeURL) {
        self.url = url
        if url.scheme == "mrtplus" {
            self.addressText = ""
            self.title = "Старт"
        } else {
            self.addressText = url.absoluteString
        }
    }

    func navigate(to url: URL) {
        self.url = url
        if url.scheme == "mrtplus" {
            self.addressText = ""
            self.title = "Старт"
            return
        }
        self.addressText = url.absoluteString
        if bridge.isAttached {
            bridge.load(url)
        }
    }

    func goHome() {
        navigate(to: Self.homeURL)
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
