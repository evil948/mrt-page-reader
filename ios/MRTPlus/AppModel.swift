import Foundation
import Combine

@MainActor
final class AppModel: ObservableObject {
    @Published var tabs: [BrowserTab] = []
    @Published var selectedTabID: UUID?
    @Published var bookmarks: [Bookmark] = []
    @Published var showBookmarks = false
    @Published var showAddBookmark = false
    @Published var voiceID: String
    @Published var speakStatus: String = ""
    @Published var isSpeaking = false
    @Published var isPaused = false
    @Published var speakPanelOpen = false

    let speakController: SpeakController
    private let bookmarkStore: BookmarkStore
    private let prefsKey = "mrt_plus_voice"

    var selectedTab: BrowserTab? {
        tabs.first { $0.id == selectedTabID }
    }

    init(bookmarkStore: BookmarkStore = BookmarkStore()) {
        self.bookmarkStore = bookmarkStore
        let speakController = SpeakController()
        self.speakController = speakController
        self.voiceID = UserDefaults.standard.string(forKey: prefsKey) ?? VoiceCatalog.defaultID
        self.bookmarks = bookmarkStore.load()
        if tabs.isEmpty {
            addTab(url: BrowserTab.homeURL)
        }
        speakController.onStatus = { [weak self] status in
            Task { @MainActor in
                self?.speakStatus = status
            }
        }
        speakController.onStateChange = { [weak self] speaking, paused in
            Task { @MainActor in
                self?.isSpeaking = speaking
                self?.isPaused = paused
                if speaking || paused {
                    self?.speakPanelOpen = true
                }
            }
        }
    }

    func addTab(url: URL = BrowserTab.homeURL) {
        let tab = BrowserTab(url: url)
        tabs.append(tab)
        selectedTabID = tab.id
    }

    func closeTab(_ id: UUID) {
        guard tabs.count > 1 else {
            // Reset last tab to home
            if let tab = tabs.first {
                tab.goHome()
                speakController.stop()
            }
            return
        }
        tabs.removeAll { $0.id == id }
        if selectedTabID == id {
            selectedTabID = tabs.last?.id
        }
        speakController.stop()
    }

    func selectTab(_ id: UUID) {
        if selectedTabID != id {
            speakController.stop()
        }
        selectedTabID = id
    }

    func openBookmark(_ bookmark: Bookmark) {
        if let tab = selectedTab {
            tab.navigate(to: bookmark.url)
        } else {
            addTab(url: bookmark.url)
        }
        showBookmarks = false
    }

    func addCurrentPageAsBookmark(title: String?, url: URL?) {
        guard let url, url.scheme != "mrtplus" else { return }
        let name = (title?.isEmpty == false ? title! : url.host) ?? url.absoluteString
        bookmarkStore.add(Bookmark(title: name, url: url))
        bookmarks = bookmarkStore.load()
    }

    func removeBookmark(_ bookmark: Bookmark) {
        bookmarkStore.remove(bookmark)
        bookmarks = bookmarkStore.load()
    }

    func removeBookmarks(at offsets: IndexSet) {
        bookmarkStore.remove(at: offsets)
        bookmarks = bookmarkStore.load()
    }

    func moveBookmarks(from source: IndexSet, to destination: Int) {
        bookmarkStore.move(from: source, to: destination)
        bookmarks = bookmarkStore.load()
    }

    func updateBookmark(_ bookmark: Bookmark) {
        bookmarkStore.update(bookmark)
        bookmarks = bookmarkStore.load()
    }

    func addBookmark(_ bookmark: Bookmark) {
        bookmarkStore.add(bookmark)
        bookmarks = bookmarkStore.load()
    }

    func setVoice(_ id: String) {
        voiceID = id
        UserDefaults.standard.set(id, forKey: prefsKey)
    }

    func speak(webBridge: WebViewBridge?) {
        guard let webBridge, selectedTab?.isHome != true else {
            speakStatus = selectedTab?.isHome == true
                ? "Откройте статью из закладок."
                : "Страница ещё не готова."
            speakPanelOpen = true
            return
        }
        speakPanelOpen = true
        Task {
            await speakController.start(bridge: webBridge, voiceID: voiceID)
        }
    }

    func togglePause() {
        speakController.togglePause()
    }

    func stopSpeaking() {
        speakController.stop()
    }
}
