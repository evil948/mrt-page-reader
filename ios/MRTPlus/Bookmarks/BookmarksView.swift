import SwiftUI

struct BookmarksView: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var newTitle = ""
    @State private var newURL = ""
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            List {
                Section("Новостные сайты") {
                    ForEach(app.bookmarks) { bookmark in
                        Button {
                            app.openBookmark(bookmark)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(bookmark.title).foregroundStyle(.primary)
                                Text(bookmark.url.host ?? bookmark.url.absoluteString)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        for i in indexSet {
                            app.removeBookmark(app.bookmarks[i])
                        }
                    }
                }
            }
            .navigationTitle("Закладки")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showAdd = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAdd) {
                NavigationStack {
                    Form {
                        TextField("Название", text: $newTitle)
                        TextField("https://…", text: $newURL)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                    }
                    .navigationTitle("Новый сайт")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Отмена") { showAdd = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Добавить") {
                                addBookmark()
                            }
                            .disabled(URL(string: normalizedURL(newURL)) == nil)
                        }
                    }
                }
                .presentationDetents([.medium])
            }
        }
    }

    private func normalizedURL(_ raw: String) -> String {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("http://") || t.hasPrefix("https://") { return t }
        return "https://\(t)"
    }

    private func addBookmark() {
        let urlString = normalizedURL(newURL)
        guard let url = URL(string: urlString) else { return }
        let title = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        app.addBookmark(Bookmark(
            title: title.isEmpty ? (url.host ?? urlString) : title,
            url: url
        ))
        newTitle = ""
        newURL = ""
        showAdd = false
    }
}
