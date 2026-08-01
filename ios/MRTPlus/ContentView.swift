import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        VStack(spacing: 0) {
            tabBar
            toolbar
            if app.selectedTab != nil {
                ZStack(alignment: .bottom) {
                    ZStack {
                        ForEach(app.tabs) { tab in
                            BrowserWebView(tab: tab, bridge: tab.bridge)
                                .opacity(tab.id == app.selectedTabID ? 1 : 0)
                                .allowsHitTesting(tab.id == app.selectedTabID)
                        }
                    }
                    speakBar
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
                    let url = app.bookmarks.first?.url ?? URL(string: "https://lenta.ru")!
                    app.addTab(url: url)
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
                .disabled(!(app.selectedTab?.canGoBack ?? false))

                Button { app.selectedTab?.bridge.goForward() } label: {
                    Image(systemName: "chevron.forward")
                }
                .disabled(!(app.selectedTab?.canGoForward ?? false))

                Button { app.selectedTab?.bridge.reload() } label: {
                    Image(systemName: "arrow.clockwise")
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
            }
            .padding(.horizontal, 12)

            if let tab = app.selectedTab, tab.isLoading {
                ProgressView(value: tab.estimatedProgress)
                    .progressViewStyle(.linear)
                    .padding(.horizontal, 12)
            }
        }
        .padding(.bottom, 6)
        .background(Color(.systemBackground))
    }

    private var speakBar: some View {
        VStack(spacing: 8) {
            if !app.speakStatus.isEmpty {
                Text(app.speakStatus)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.88))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            HStack(spacing: 10) {
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

                Spacer(minLength: 0)

                if app.isSpeaking && !app.isPaused {
                    Button {
                        app.togglePause()
                    } label: {
                        Label("Пауза", systemImage: "pause.fill")
                    }
                    .buttonStyle(SpeakButtonStyle(color: Color(red: 0.77, green: 0.54, blue: 0.09)))
                } else if app.isPaused {
                    Button {
                        app.togglePause()
                    } label: {
                        Label("Далее", systemImage: "play.fill")
                    }
                    .buttonStyle(SpeakButtonStyle(color: Color(red: 0.18, green: 0.62, blue: 0.27)))
                }

                if app.isSpeaking || app.isPaused {
                    Button {
                        app.stopSpeaking()
                    } label: {
                        Label("Стоп", systemImage: "stop.fill")
                    }
                    .buttonStyle(SpeakButtonStyle(color: Color(red: 0.85, green: 0.28, blue: 0.28)))
                }

                if !app.isSpeaking && !app.isPaused {
                    Button {
                        app.speak(webBridge: app.selectedTab?.bridge)
                    } label: {
                        Label("Озвучить", systemImage: "play.fill")
                    }
                    .buttonStyle(SpeakButtonStyle(color: Color(red: 0.18, green: 0.44, blue: 0.93)))
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
    }
}

private struct TabChip: View {
    @ObservedObject var tab: BrowserTab
    let selected: Bool
    let onSelect: () -> Void
    let onClose: () -> Void

    private var title: String {
        tab.title.isEmpty ? (tab.url.host ?? "Вкладка") : tab.title
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

private struct SpeakButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(color.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(Capsule())
    }
}
