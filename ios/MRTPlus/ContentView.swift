import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        VStack(spacing: 0) {
            tabBar
            toolbar
            if let tab = app.selectedTab {
                ZStack(alignment: .bottomTrailing) {
                    ZStack {
                        ForEach(app.tabs) { t in
                            if !t.isHome {
                                BrowserWebView(tab: t, bridge: t.bridge)
                                    .opacity(t.id == app.selectedTabID ? 1 : 0)
                                    .allowsHitTesting(t.id == app.selectedTabID)
                            }
                        }
                        if tab.isHome {
                            HomeView()
                        }
                    }
                    speakChrome
                }
            } else {
                ContentUnavailableView("Нет вкладок", systemImage: "globe")
            }
        }
        .background(Color(.systemGroupedBackground))
        .sheet(isPresented: $app.showBookmarks) {
            BookmarksView()
                .environmentObject(app)
        }
        .task {
            await ContentBlocker.ensureCompiled()
        }
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(app.tabs) { tab in
                    TabChip(
                        tab: tab,
                        selected: tab.id == app.selectedTabID,
                        onSelect: { app.selectTab(tab.id) },
                        onClose: { app.closeTab(tab.id) }
                    )
                }
                Button {
                    app.addTab()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(width: 32, height: 32)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.ultraThinMaterial)
    }

    private var toolbar: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Button { app.selectedTab?.bridge.goBack() } label: {
                    Image(systemName: "chevron.backward")
                }
                .disabled(app.selectedTab?.isHome == true || !(app.selectedTab?.canGoBack ?? false))

                Button { app.selectedTab?.bridge.goForward() } label: {
                    Image(systemName: "chevron.forward")
                }
                .disabled(app.selectedTab?.isHome == true || !(app.selectedTab?.canGoForward ?? false))

                Button {
                    if app.selectedTab?.isHome == true { return }
                    app.selectedTab?.bridge.reload()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(app.selectedTab?.isHome == true)

                Button {
                    app.selectedTab?.goHome()
                } label: {
                    Image(systemName: "house")
                }

                if let tab = app.selectedTab {
                    TextField("Адрес или поиск", text: Binding(
                        get: { tab.addressText },
                        set: { tab.addressText = $0 }
                    ))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .onSubmit { tab.submitAddress() }
                }

                Button { app.showBookmarks = true } label: {
                    Image(systemName: "bookmark")
                }

                Button {
                    app.addCurrentPageAsBookmark(
                        title: app.selectedTab?.title,
                        url: app.selectedTab?.url
                    )
                } label: {
                    Image(systemName: "bookmark.fill")
                }
                .disabled(app.selectedTab?.isHome == true)
            }
            .padding(.horizontal, 12)

            if let tab = app.selectedTab, tab.isLoading, !tab.isHome {
                ProgressView(value: tab.estimatedProgress)
                    .progressViewStyle(.linear)
                    .padding(.horizontal, 12)
            }
        }
        .padding(.bottom, 6)
        .background(Color(.systemBackground))
    }

    /// Compact FAB by default so cookie banners stay tappable; expands while speaking / on tap.
    private var speakChrome: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if app.speakPanelOpen {
                VStack(alignment: .trailing, spacing: 8) {
                    if !app.speakStatus.isEmpty {
                        Text(app.speakStatus)
                            .font(.footnote.monospaced())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.black.opacity(0.88))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .frame(maxWidth: 320, alignment: .trailing)
                    }

                    HStack(spacing: 8) {
                        Picker("Голос", selection: Binding(
                            get: { app.voiceID },
                            set: { app.setVoice($0) }
                        )) {
                            ForEach(VoiceCatalog.all) { v in
                                Text(v.label).tag(v.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color(white: 0.22))
                        .clipShape(Capsule())

                        if app.isSpeaking && !app.isPaused {
                            Button { app.togglePause() } label: {
                                Image(systemName: "pause.fill")
                            }
                            .buttonStyle(SpeakIconStyle(color: Color(red: 0.77, green: 0.54, blue: 0.09)))
                        } else if app.isPaused {
                            Button { app.togglePause() } label: {
                                Image(systemName: "play.fill")
                            }
                            .buttonStyle(SpeakIconStyle(color: Color(red: 0.18, green: 0.62, blue: 0.27)))
                        }

                        if app.isSpeaking || app.isPaused {
                            Button { app.stopSpeaking() } label: {
                                Image(systemName: "stop.fill")
                            }
                            .buttonStyle(SpeakIconStyle(color: Color(red: 0.85, green: 0.28, blue: 0.28)))
                        }

                        if !app.isSpeaking && !app.isPaused {
                            Button {
                                app.speak(webBridge: app.selectedTab?.bridge)
                            } label: {
                                Text("Озвучить")
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(Color(red: 0.18, green: 0.44, blue: 0.93))
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(10)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
                }
                .padding(.trailing, 12)
                .padding(.bottom, 4)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }

            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    if app.isSpeaking || app.isPaused {
                        app.speakPanelOpen = true
                    } else {
                        app.speakPanelOpen.toggle()
                    }
                }
            } label: {
                Text(app.speakPanelOpen ? "×" : "▶")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        (app.isSpeaking || app.isPaused)
                            ? Color(red: 0.77, green: 0.54, blue: 0.09)
                            : Color(red: 0.18, green: 0.44, blue: 0.93)
                    )
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.25), radius: 8, y: 3)
                    .opacity(app.speakPanelOpen || app.isSpeaking || app.isPaused ? 1 : 0.55)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 14)
            .padding(.bottom, 14)
            .accessibilityLabel(app.speakPanelOpen ? "Свернуть озвучку" : "MRT+ озвучка")
        }
    }
}

struct HomeView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("MRT+")
                    .font(.largeTitle.weight(.bold))
                Text("v1.0.1")
                    .font(.caption.monospaced())
                    .foregroundStyle(.tertiary)
                Text("Выберите новостной сайт — потом откройте статью и нажмите ▶")
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                    ForEach(app.bookmarks) { bookmark in
                        Button {
                            app.openBookmark(bookmark)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(bookmark.title)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                Text(bookmark.url.host ?? "")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
                            .padding(14)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(20)
        }
    }
}

private struct TabChip: View {
    @ObservedObject var tab: BrowserTab
    let selected: Bool
    let onSelect: () -> Void
    let onClose: () -> Void

    private var title: String {
        if tab.isHome { return "Старт" }
        return tab.title.isEmpty ? (tab.url.host ?? "Вкладка") : tab.title
    }

    var body: some View {
        HStack(spacing: 6) {
            Button(action: onSelect) {
                Text(title)
                    .lineLimit(1)
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: 120)
            }
            .buttonStyle(.plain)

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
            }
            .buttonStyle(.plain)
            .opacity(0.55)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(selected ? Color.accentColor.opacity(0.2) : Color(.secondarySystemBackground))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(selected ? Color.accentColor.opacity(0.5) : .clear, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct SpeakIconStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: 40, height: 40)
            .background(color.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(Circle())
    }
}
