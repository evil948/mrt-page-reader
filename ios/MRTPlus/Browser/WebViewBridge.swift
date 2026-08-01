import Foundation
import WebKit

/// Bridge between SwiftUI and a single WKWebView instance.
@MainActor
final class WebViewBridge: NSObject, ObservableObject {
    weak var webView: WKWebView?
    private var extractJS: String?

    func attach(_ webView: WKWebView) {
        self.webView = webView
        if extractJS == nil {
            extractJS = Self.loadExtractScript()
        }
    }

    func load(_ url: URL) {
        webView?.load(URLRequest(url: url))
    }

    var isAttached: Bool { webView != nil }

    func goBack() { webView?.goBack() }
    func goForward() { webView?.goForward() }
    func reload() { webView?.reload() }

    func injectExtractIfNeeded() async {
        guard let webView, let extractJS else { return }
        let check = try? await webView.evaluateJavaScript("typeof window.MRTPlusExtract")
        if (check as? String) == "object" { return }
        _ = try? await webView.evaluateJavaScript(extractJS)
    }

    func extractSpeakPlan(selectionOnly: Bool) async throws -> SpeakPlan? {
        await injectExtractIfNeeded()
        guard let webView else { return nil }
        let js = "JSON.stringify(window.MRTPlusExtract.buildSpeakPlan(\(selectionOnly)))"
        let result = try await webView.evaluateJavaScript(js)
        guard let json = result as? String, json != "null",
              let data = json.data(using: .utf8)
        else { return nil }
        return try JSONDecoder().decode(SpeakPlan.self, from: data)
    }

    func clearHighlights() async {
        await injectExtractIfNeeded()
        _ = try? await webView?.evaluateJavaScript("window.MRTPlusExtract.clearHighlights()")
    }

    func highlight(pid: Int, donePids: [Int]) async {
        await injectExtractIfNeeded()
        let done = donePids.map(String.init).joined(separator: ",")
        let js = "window.MRTPlusExtract.highlightPid(\(pid), [\(done)])"
        _ = try? await webView?.evaluateJavaScript(js)
    }

    func currentPageURL() async -> String? {
        await injectExtractIfNeeded()
        let result = try? await webView?.evaluateJavaScript("window.MRTPlusExtract.pageUrlKey()")
        return result as? String
    }

    private static func loadExtractScript() -> String {
        if let url = Bundle.main.url(forResource: "extract", withExtension: "js"),
           let text = try? String(contentsOf: url, encoding: .utf8)
        {
            return text
        }
        // Fallback when running without resource copy (preview / misconfigured target)
        return "window.MRTPlusExtract={buildSpeakPlan:()=>null,clearHighlights:()=>{},highlightPid:()=>{},pageUrlKey:()=>location.href};"
    }
}

extension WKWebView {
    @MainActor
    func evaluateJavaScript(_ javaScriptString: String) async throws -> Any? {
        try await withCheckedThrowingContinuation { cont in
            evaluateJavaScript(javaScriptString) { result, error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume(returning: result)
                }
            }
        }
    }
}
