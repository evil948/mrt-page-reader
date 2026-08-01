import SwiftUI
import WebKit

struct BrowserWebView: UIViewRepresentable {
    @ObservedObject var tab: BrowserTab
    let bridge: WebViewBridge

    func makeCoordinator() -> Coordinator {
        Coordinator(tab: tab, bridge: bridge)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        if let list = ContentBlocker.sharedList {
            config.userContentController.add(list)
        }
        let pageJS = ContentBlocker.pageScriptsSource()
        if !pageJS.isEmpty {
            let script = WKUserScript(source: pageJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            config.userContentController.addUserScript(script)
        }

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = context.coordinator
        wv.uiDelegate = context.coordinator
        wv.allowsBackForwardNavigationGestures = true
        wv.scrollView.contentInsetAdjustmentBehavior = .automatic
        bridge.attach(wv)
        context.coordinator.observe(wv)

        if !tab.isHome {
            wv.load(URLRequest(url: tab.url))
        }
        return wv
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        bridge.attach(webView)
        context.coordinator.tab = tab
        // If tab navigated to a real URL before the web view existed, load now.
        if !tab.isHome,
           webView.url == nil || webView.url?.absoluteString == "about:blank"
        {
            webView.load(URLRequest(url: tab.url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var tab: BrowserTab
        let bridge: WebViewBridge
        private var observations: [NSKeyValueObservation] = []

        init(tab: BrowserTab, bridge: WebViewBridge) {
            self.tab = tab
            self.bridge = bridge
        }

        func observe(_ webView: WKWebView) {
            observations = [
                webView.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, _ in
                    DispatchQueue.main.async { self?.tab.estimatedProgress = wv.estimatedProgress }
                },
                webView.observe(\.isLoading, options: [.new]) { [weak self] wv, _ in
                    DispatchQueue.main.async { self?.tab.isLoading = wv.isLoading }
                },
                webView.observe(\.title, options: [.new]) { [weak self] wv, _ in
                    DispatchQueue.main.async { self?.tab.title = wv.title ?? "" }
                },
                webView.observe(\.canGoBack, options: [.new]) { [weak self] wv, _ in
                    DispatchQueue.main.async { self?.tab.canGoBack = wv.canGoBack }
                },
                webView.observe(\.canGoForward, options: [.new]) { [weak self] wv, _ in
                    DispatchQueue.main.async { self?.tab.canGoForward = wv.canGoForward }
                },
                webView.observe(\.url, options: [.new]) { [weak self] wv, _ in
                    DispatchQueue.main.async {
                        if let url = wv.url, url.scheme != "about" {
                            self?.tab.url = url
                            self?.tab.addressText = url.absoluteString
                        }
                    }
                },
            ]
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                await bridge.injectExtractIfNeeded()
                let js = ContentBlocker.pageScriptsSource()
                if !js.isEmpty {
                    _ = try? await webView.evaluateJavaScript(js)
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }
    }
}
