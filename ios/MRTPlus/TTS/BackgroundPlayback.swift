import AVFoundation
import MediaPlayer
import UIKit

/// Keeps TTS alive with screen off and exposes lock-screen controls.
@MainActor
enum BackgroundPlayback {
    private static var configured = false
    private static var bgTask = UIBackgroundTaskIdentifier.invalid

    static func activateSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [])
        try session.setActive(true, options: [])
        configureRemoteCommandsIfNeeded()
    }

    static func configureRemoteCommandsIfNeeded() {
        guard !configured else { return }
        configured = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.stopCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = false
        center.previousTrackCommand.isEnabled = false

        // Handlers are wired from SpeakController via callbacks
    }

    static func bindRemoteCommands(
        onPlay: @escaping () -> Void,
        onPause: @escaping () -> Void,
        onToggle: @escaping () -> Void,
        onStop: @escaping () -> Void
    ) {
        configureRemoteCommandsIfNeeded()
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.removeTarget(nil)
        center.pauseCommand.removeTarget(nil)
        center.togglePlayPauseCommand.removeTarget(nil)
        center.stopCommand.removeTarget(nil)

        center.playCommand.addTarget { _ in
            onPlay()
            return .success
        }
        center.pauseCommand.addTarget { _ in
            onPause()
            return .success
        }
        center.togglePlayPauseCommand.addTarget { _ in
            onToggle()
            return .success
        }
        center.stopCommand.addTarget { _ in
            onStop()
            return .success
        }
        UIApplication.shared.beginReceivingRemoteControlEvents()
    }

    static func updateNowPlaying(title: String, subtitle: String, elapsed: Double, duration: Double, rate: Double) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: subtitle,
            MPNowPlayingInfoPropertyPlaybackRate: rate,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, elapsed),
        ]
        if duration.isFinite, duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = rate > 0 ? .playing : .paused
    }

    static func clearNowPlaying() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
    }

    static func beginTask(name: String = "mrt-plus-tts") {
        endTask()
        bgTask = UIApplication.shared.beginBackgroundTask(withName: name) {
            endTask()
        }
    }

    static func endTask() {
        guard bgTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(bgTask)
        bgTask = .invalid
    }
}
