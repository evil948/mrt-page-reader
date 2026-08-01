import Foundation
import WebKit

@MainActor
enum ContentBlocker {
    private static let listIdentifier = "io.github.evil948.mrtplus.adblock"
    private(set) static var sharedList: WKContentRuleList?
    private static var compiling: Task<Void, Never>?

    static func ensureCompiled() async {
        if sharedList != nil { return }
        if let compiling {
            await compiling.value
            return
        }
        let task = Task { @MainActor in
            guard let url = Bundle.main.url(forResource: "adblock-rules", withExtension: "json"),
                  let data = try? Data(contentsOf: url),
                  let json = String(data: data, encoding: .utf8)
            else { return }
            do {
                sharedList = try await compile(json: json)
            } catch {
                print("MRT+ content blocker: \(error.localizedDescription)")
            }
        }
        compiling = task
        await task.value
        compiling = nil
    }

    private static func compile(json: String) async throws -> WKContentRuleList {
        try await withCheckedThrowingContinuation { cont in
            WKContentRuleListStore.default().compileContentRuleList(
                forIdentifier: listIdentifier,
                encodedContentRuleList: json
            ) { list, error in
                if let error {
                    cont.resume(throwing: error)
                } else if let list {
                    cont.resume(returning: list)
                } else {
                    cont.resume(throwing: NSError(
                        domain: "MRTPlus",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "empty content rule list"]
                    ))
                }
            }
        }
    }

    static func pageScriptsSource() -> String {
        if let url = Bundle.main.url(forResource: "page-scripts", withExtension: "js"),
           let text = try? String(contentsOf: url, encoding: .utf8)
        {
            return text
        }
        return ""
    }
}
