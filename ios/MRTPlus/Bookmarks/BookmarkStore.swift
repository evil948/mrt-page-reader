import Foundation

struct Bookmark: Identifiable, Codable, Equatable, Hashable {
    var id: UUID
    var title: String
    var url: URL

    init(id: UUID = UUID(), title: String, url: URL) {
        self.id = id
        self.title = title
        self.url = url
    }
}

final class BookmarkStore {
    private let key = "mrt_plus_bookmarks"

    static let defaults: [Bookmark] = [
        Bookmark(title: "Лента", url: URL(string: "https://lenta.ru")!),
        Bookmark(title: "РИА", url: URL(string: "https://ria.ru")!),
        Bookmark(title: "РБК", url: URL(string: "https://www.rbc.ru")!),
        Bookmark(title: "Медуза", url: URL(string: "https://meduza.io")!),
        Bookmark(title: "ТАСС", url: URL(string: "https://tass.ru")!),
        Bookmark(title: "Коммерсантъ", url: URL(string: "https://www.kommersant.ru")!),
        Bookmark(title: "Газета.Ru", url: URL(string: "https://www.gazeta.ru")!),
        Bookmark(title: "Ridus", url: URL(string: "https://www.ridus.ru")!),
    ]

    func load() -> [Bookmark] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([Bookmark].self, from: data),
              !decoded.isEmpty
        else {
            save(Self.defaults)
            return Self.defaults
        }
        return decoded
    }

    func save(_ items: [Bookmark]) {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func add(_ bookmark: Bookmark) {
        var items = load()
        if items.contains(where: { $0.url == bookmark.url }) { return }
        items.append(bookmark)
        save(items)
    }

    func remove(_ bookmark: Bookmark) {
        var items = load()
        items.removeAll { $0.id == bookmark.id }
        save(items)
    }
}
