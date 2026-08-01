import SwiftUI

struct BookmarksView: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var newTitle = ""
    @State private var newURL = ""
    @State private var showAdd = false
    @State private var editing: Bookmark?
    @State private var editMode: EditMode = .inactive

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(app.bookmarks) { bookmark in
                        if editMode.isEditing {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(bookmark.title)
                                Text(bookmark.url.absoluteString)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    app.removeBookmark(bookmark)
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                                Button {
                                    editing = bookmark
                                    newTitle = bookmark.title
                                    newURL = bookmark.url.absoluteString
                                } label: {
                                    Label("Изменить", systemImage: "pencil")
                                }
                                .tint(.orange)
                            }
                        } else {
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
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    app.removeBookmark(bookmark)
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                                Button {
                                    editing = bookmark
                                    newTitle = bookmark.title
                                    newURL = bookmark.url.absoluteString
                                } label: {
                                    Label("Изменить", systemImage: "pencil")
                                }
                                .tint(.orange)
                            }
                        }
                    }
                    .onDelete { app.removeBookmarks(at: $0) }
                    .onMove { app.moveBookmarks(from: $0, to: $1) }
                } header: {
                    Text("Новостные сайты")
                } footer: {
                    Text("«Править» — порядок. Свайп влево — изменить или удалить. Плюс — добавить свой URL.")
                }
            }
            .environment(\.editMode, $editMode)
            .navigationTitle("Сайты")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Готово") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editing = nil
                        newTitle = ""
                        newURL = ""
                        showAdd = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAdd) {
                bookmarkForm(navTitle: "Новый сайт", existing: nil)
            }
            .sheet(item: $editing) { bookmark in
                bookmarkForm(navTitle: "Изменить", existing: bookmark)
                    .onAppear {
                        newTitle = bookmark.title
                        newURL = bookmark.url.absoluteString
                    }
            }
        }
    }

    private func bookmarkForm(navTitle: String, existing: Bookmark?) -> some View {
        NavigationStack {
            Form {
                TextField("Название", text: $newTitle)
                TextField("https://…", text: $newURL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
            }
            .navigationTitle(navTitle)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") {
                        showAdd = false
                        editing = nil
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(existing == nil ? "Добавить" : "Сохранить") {
                        saveEditor(existing: existing)
                    }
                    .disabled(URL(string: normalizedURL(newURL)) == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func normalizedURL(_ raw: String) -> String {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("http://") || t.hasPrefix("https://") { return t }
        return "https://\(t)"
    }

    private func saveEditor(existing: Bookmark?) {
        let urlString = normalizedURL(newURL)
        guard let url = URL(string: urlString) else { return }
        let name = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = name.isEmpty ? (url.host ?? urlString) : name
        if let existing {
            app.updateBookmark(Bookmark(id: existing.id, title: title, url: url))
            editing = nil
        } else {
            app.addBookmark(Bookmark(title: title, url: url))
            showAdd = false
        }
        newTitle = ""
        newURL = ""
    }
}
