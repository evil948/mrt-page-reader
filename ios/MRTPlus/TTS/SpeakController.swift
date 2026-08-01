import Foundation

struct SpeakUnitRange: Codable {
    let pid: Int
    let start: Int
    let end: Int
}

struct SpeakUnit: Codable {
    let text: String
    let pids: [Int]
    let ranges: [SpeakUnitRange]
}

struct SpeakPlan: Codable {
    let pageUrl: String
    let chunks: [String]
    let units: [SpeakUnit]
}

@MainActor
final class SpeakController {
    var onStatus: ((String) -> Void)?
    var onStateChange: ((_ speaking: Bool, _ paused: Bool) -> Void)?

    private let tts = UniproxyTTS()
    private let player = ChunkAudioPlayer()
    private var runToken = 0
    private var paused = false
    private var stopped = false
    private var sessionIndex = 0
    private var sessionChunks: [String] = []
    private var sessionUnits: [SpeakUnit] = []
    private var sessionPageURL = ""
    private var voiceID = VoiceCatalog.defaultID
    private weak var bridge: WebViewBridge?
    private var audioConfirmed = false

    private let charsPerMin = 900.0

    func start(bridge: WebViewBridge, voiceID: String) async {
        self.bridge = bridge
        self.voiceID = voiceID
        stopInternal(notify: false)
        let token = runToken

        onStatus?("Ищу текст статьи…")
        onStateChange?(true, false)

        do {
            guard let plan = try await bridge.extractSpeakPlan(selectionOnly: false) else {
                onStatus?("Не удалось найти текст статьи.")
                onStateChange?(false, false)
                return
            }
            sessionChunks = plan.chunks
            sessionUnits = plan.units
            sessionPageURL = plan.pageUrl
            sessionIndex = 0
            stopped = false
            paused = false

            try await playSession(token: token)
        } catch {
            if token != runToken { return }
            onStatus?("Ошибка TTS: \(error.localizedDescription)")
            onStateChange?(false, true)
        }
    }

    func togglePause() {
        guard !sessionChunks.isEmpty, !stopped else { return }
        if paused {
            paused = false
            player.resume()
            onStateChange?(true, false)
            onStatus?(formatStatus(prefix: "▶"))
        } else {
            paused = true
            player.pause()
            onStateChange?(true, true)
            onStatus?(formatStatus(prefix: "⏸"))
        }
    }

    func stop() {
        stopInternal(notify: true)
        Task { await bridge?.clearHighlights() }
    }

    private func stopInternal(notify: Bool) {
        runToken += 1
        stopped = true
        paused = false
        player.stop()
        Task { await tts.close() }
        if notify {
            onStateChange?(false, false)
            onStatus?("")
        }
    }

    private func playSession(token: Int) async throws {
        try await tts.connect()

        var nextAudio: Task<(Data, String), Error>? = Task {
            try await synthAt(sessionIndex)
        }

        while sessionIndex < sessionChunks.count {
            if token != runToken { return }
            if stopped { return }

            while paused {
                try await Task.sleep(nanoseconds: 200_000_000)
                if token != runToken || stopped { return }
            }

            audioConfirmed = false
            onStatus?(formatStatus(prefix: "▶"))
            await highlightCurrent(progress: 0)

            let currentTask = nextAudio ?? Task { try await synthAt(sessionIndex) }
            let (audio, mime) = try await currentTask.value
            if token != runToken { return }

            let following = sessionIndex + 1
            if following < sessionChunks.count {
                nextAudio = Task { try await synthAt(following) }
            } else {
                nextAudio = nil
            }

            if stopped { return }
            while paused {
                try await Task.sleep(nanoseconds: 200_000_000)
                if token != runToken || stopped { return }
            }

            audioConfirmed = true
            onStateChange?(true, false)
            onStatus?(formatStatus(prefix: "▶"))

            let highlightTask = Task { @MainActor in
                while !Task.isCancelled {
                    if self.stopped || self.paused { break }
                    let p = self.player.progress
                    await self.highlightCurrent(progress: p)
                    self.onStatus?(self.formatStatus(prefix: "▶"))
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    if !self.player.isPlaying { break }
                }
            }

            do {
                try await player.play(data: audio, mimeHint: mime)
            } catch {
                highlightTask.cancel()
                // If mp3 path failed and we got opus, surface clear error
                throw error
            }
            highlightTask.cancel()

            if token != runToken || stopped { return }
            if paused {
                nextAudio = Task { try await synthAt(sessionIndex) }
                continue
            }

            sessionIndex += 1
            audioConfirmed = false
        }

        await bridge?.clearHighlights()
        onStateChange?(false, false)
        let n = sessionChunks.count
        onStatus?(n > 1 ? "Готово: \(n) блоков." : "Готово.")
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        if token == runToken {
            onStatus?("")
        }
    }

    private func synthAt(_ index: Int) async throws -> (Data, String) {
        let prepared = sessionChunks[index]
        var result = try await tts.synthesize(text: prepared, voice: voiceID)
        if isWeak(result.data, text: prepared) {
            let soft = softenForRetry(prepared)
            let retry = try await tts.synthesize(text: soft, voice: voiceID)
            if retry.data.count >= result.data.count {
                result = retry
            }
        }
        return (result.data, result.mimeHint)
    }

    private func highlightCurrent(progress: Double) async {
        guard sessionIndex < sessionUnits.count else { return }
        let unit = sessionUnits[sessionIndex]
        guard !unit.ranges.isEmpty else {
            if let pid = unit.pids.first {
                await bridge?.highlight(pid: pid, donePids: [])
            }
            return
        }
        let pos = Double(unit.text.count) * min(1, max(0, progress))
        var active = unit.ranges[0]
        var done: [Int] = []
        for r in unit.ranges {
            if Double(r.start) <= pos {
                active = r
            }
            if Double(r.end) <= pos + 0.5 {
                done.append(r.pid)
            }
            if Double(r.end) > pos {
                active = r
                break
            }
        }
        done.removeAll { $0 == active.pid }
        await bridge?.highlight(pid: active.pid, donePids: done)
    }

    private func formatStatus(prefix: String) -> String {
        let n = max(1, sessionChunks.count)
        let i = min(sessionIndex + 1, n)
        let head = n > 1 ? "Блок \(i)/\(n)" : "Озвучка"
        let voice = VoiceCatalog.label(for: voiceID)
        if !audioConfirmed && !paused {
            return "Готовлю Яндекс… \(head) · \(voice)"
        }
        return "\(prefix) \(head) · \(voice) · осталось \(eta())"
    }

    private func eta() -> String {
        var sec = 0.0
        if audioConfirmed, !paused, player.progress > 0 {
            let rem = sessionChunks[sessionIndex]
            sec += (1 - player.progress) * (Double(rem.count) / charsPerMin) * 60
        } else if sessionIndex < sessionChunks.count {
            sec += (Double(sessionChunks[sessionIndex].count) / charsPerMin) * 60
        }
        for i in (sessionIndex + 1)..<sessionChunks.count {
            sec += (Double(sessionChunks[i].count) / charsPerMin) * 60
        }
        if sec < 5 { return "~несколько сек" }
        if sec < 60 { return "~\(max(5, Int((sec / 5).rounded()) * 5)) сек" }
        let m = sec / 60
        if m < 10 {
            let s = String(format: "%.1f", m).replacingOccurrences(of: ".0", with: "")
            return "~\(s) мин"
        }
        return "~\(Int(m.rounded())) мин"
    }

    private func isWeak(_ data: Data, text: String) -> Bool {
        let letters = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count
        if letters < 28 { return false }
        return data.count < max(2800, letters * 35)
    }

    private func softenForRetry(_ text: String) -> String {
        var t = text.replacingOccurrences(of: ",", with: ".")
        t = t.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let last = t.last, !".!?…".contains(last) {
            t += "."
        }
        return t
    }
}
