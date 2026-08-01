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
    private let migrationKey = "mrt_plus_bookmarks_migration"

    static let defaults: [Bookmark] = [
        Bookmark(title: "Лента", url: URL(string: "https://lenta.ru")!),
        Bookmark(title: "РИА", url: URL(string: "https://ria.ru")!),
        Bookmark(title: "РБК", url: URL(string: "https://www.rbc.ru")!),
        Bookmark(title: "ТАСС", url: URL(string: "https://tass.ru")!),
        Bookmark(title: "Коммерсантъ", url: URL(string: "https://www.kommersant.ru")!),
        Bookmark(title: "Газета.Ru", url: URL(string: "https://www.gazeta.ru")!),
        Bookmark(title: "Ridus", url: URL(string: "https://www.ridus.ru")!),
    ]

    func load() -> [Bookmark] {
        var items: [Bookmark]
        if let data = UserDefaults.standard.data(forKey: key),
           let decoded = try? JSONDecoder().decode([Bookmark].self, from: data),
           !decoded.isEmpty
        {
            items = decoded
        } else {
            items = Self.defaults
        }

        // One-time: drop Meduza from previously shipped defaults
        let migration = UserDefaults.standard.integer(forKey: migrationKey)
        if migration < 2 {
            items.removeAll { bookmark in
                guard let host = bookmark.url.host?.lowercased() else { return false }
                return host == "meduza.io" || host.hasSuffix(".meduza.io")
            }
            UserDefaults.standard.set(2, forKey: migrationKey)
        }

        if items.isEmpty {
            items = Self.defaults
        }
        save(items)
        return items
    }

    func save(_ items: [Bookmark]) {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func add(_ bookmark: Bookmark) {
        var items = load()
        if items.contains(where: { $0.url.host == bookmark.url.host && $0.url.path == bookmark.url.path }) {
            return
        }
        items.append(bookmark)
        save(items)
    }

    func remove(_ bookmark: Bookmark) {
        var items = load()
        items.removeAll { $0.id == bookmark.id }
        save(items)
    }

    func remove(at offsets: IndexSet) {
        var items = load()
        items.remove(atOffsets: offsets)
        save(items)
    }

    func move(from source: IndexSet, to destination: Int) {
        var items = load()
        items.move(fromOffsets: source, toOffset: destination)
        save(items)
    }

    func update(_ bookmark: Bookmark) {
        var items = load()
        guard let idx = items.firstIndex(where: { $0.id == bookmark.id }) else { return }
        items[idx] = bookmark
        save(items)
    }

    func replaceAll(_ items: [Bookmark]) {
        save(items)
    }
}
