import AVFoundation
import Foundation

/// Plays MP3/WAV natively; Ogg Opus is decoded to WAV first.
@MainActor
final class ChunkAudioPlayer: NSObject, AVAudioPlayerDelegate {
    private var player: AVAudioPlayer?
    private var finishContinuation: CheckedContinuation<Void, Error>?
    private var tempURL: URL?

    func play(data: Data, mimeHint: String) async throws {
        stop(clear: true)
        try configureSession()

        let detected = Self.detectFormat(data) ?? mimeHint
        let playData: Data
        let ext: String

        if detected.contains("ogg") || detected.contains("opus") {
            playData = try OggOpusDecoder.oggOpusToWAV(data)
            ext = "wav"
        } else if detected.contains("wav") || detected.contains("lpcm") {
            playData = data
            ext = "wav"
        } else if detected.contains("mpeg") || detected == "mp3" || detected == "audio/mp3" {
            playData = data
            ext = "mp3"
        } else {
            // Unknown — try as-is, then Opus demux
            if data.count >= 4, data[0] == 0x4F, data[1] == 0x67, data[2] == 0x67, data[3] == 0x53 {
                playData = try OggOpusDecoder.oggOpusToWAV(data)
                ext = "wav"
            } else {
                playData = data
                ext = "mp3"
            }
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("mrt-plus-\(UUID().uuidString).\(ext)")
        try playData.write(to: url)
        tempURL = url

        do {
            let p = try AVAudioPlayer(contentsOf: url)
            p.delegate = self
            p.prepareToPlay()
            player = p
            guard p.play() else { throw AudioPlayError.failedToStart }
        } catch let error as AudioPlayError {
            throw error
        } catch let error as OggOpusDecoder.DecodeError {
            throw error
        } catch {
            throw AudioPlayError.failedToStart
        }

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            finishContinuation = cont
        }
    }

    private static func detectFormat(_ data: Data) -> String? {
        guard data.count >= 4 else { return nil }
        let b = [UInt8](data.prefix(4))
        if b[0] == 0x4F, b[1] == 0x67, b[2] == 0x67, b[3] == 0x53 { return "audio/ogg" }
        if b[0] == 0x49, b[1] == 0x44, b[2] == 0x33 { return "audio/mpeg" }
        if b[0] == 0xFF, (b[1] & 0xE0) == 0xE0 { return "audio/mpeg" }
        if b[0] == 0x52, b[1] == 0x49, b[2] == 0x46, b[3] == 0x46 { return "audio/wav" }
        return nil
    }

    func pause() { player?.pause() }
    func resume() { player?.play() }

    var progress: Double {
        guard let player, player.duration > 0 else { return 0 }
        return min(1, max(0, player.currentTime / player.duration))
    }

    var isPlaying: Bool { player?.isPlaying ?? false }

    func stop(clear: Bool = true) {
        player?.stop()
        player = nil
        if let cont = finishContinuation {
            finishContinuation = nil
            cont.resume()
        }
        if clear, let tempURL {
            try? FileManager.default.removeItem(at: tempURL)
            self.tempURL = nil
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            if let cont = self.finishContinuation {
                self.finishContinuation = nil
                if flag { cont.resume() }
                else { cont.resume(throwing: AudioPlayError.failedToStart) }
            }
            self.cleanupTemp()
        }
    }

    private func cleanupTemp() {
        if let tempURL {
            try? FileManager.default.removeItem(at: tempURL)
            self.tempURL = nil
        }
    }

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true)
    }
}

enum AudioPlayError: LocalizedError {
    case failedToStart

    var errorDescription: String? {
        switch self {
        case .failedToStart: return "не удалось проиграть аудио"
        }
    }
}
