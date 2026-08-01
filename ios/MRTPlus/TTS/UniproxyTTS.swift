import Foundation

/// Yandex Alice Uniproxy TTS client (same channel as desktop MRT+).
actor UniproxyTTS {
    static let speechKitKey = "bf4277fc-06c0-405a-b278-b796bbbd3f27"
    static let uniproxyURL = URL(string: "wss://uniproxy.alice.yandex.net/uni.ws")!

    /// Prefer MP3 for native AVAudioPlayer; fall back to Opus if server rejects.
    private static let preferredFormats = ["audio/mpeg", "mp3", "audio/opus"]

    private let apiKey: String
    private var task: URLSessionWebSocketTask?
    private var seq = 1
    private let uuid = UUID().uuidString.lowercased()
    private var pending: PendingSynth?
    private var connectContinuations: [CheckedContinuation<Void, Error>] = []
    private var isOpen = false
    private var receiveLoopStarted = false

    private struct PendingSynth {
        let messageId: String
        var streamId: UInt32?
        var chunks: [Data] = []
        var continuation: CheckedContinuation<Data, Error>
        var timeoutTask: Task<Void, Never>?
    }

    init(apiKey: String = UniproxyTTS.speechKitKey) {
        self.apiKey = apiKey
    }

    func connect() async throws {
        if isOpen { return }
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            connectContinuations.append(cont)
            if task == nil {
                startSocket()
            }
        }
    }

    private func startSocket() {
        let session = URLSession(configuration: .default)
        let ws = session.webSocketTask(with: Self.uniproxyURL)
        task = ws
        ws.resume()
        if !receiveLoopStarted {
            receiveLoopStarted = true
            Task { await self.receiveLoop() }
        }
        sendEvent(
            namespace: "System",
            name: "SynchronizeState",
            payload: [
                "uuid": uuid,
                "auth_token": apiKey,
                "vins": [
                    "application": [
                        "lang": "ru",
                        "platform": "windows",
                        "uuid": uuid,
                        "app_id": "ru.yandex.translate.desktop",
                    ] as [String: Any],
                ] as [String: Any],
            ]
        )
        Task {
            try? await Task.sleep(nanoseconds: 12_000_000_000)
            await self.failConnectIfNeeded(UniproxyError.timeout)
        }
    }

    private func failConnectIfNeeded(_ error: Error) {
        guard !isOpen, !connectContinuations.isEmpty else { return }
        let pending = connectContinuations
        connectContinuations.removeAll()
        pending.forEach { $0.resume(throwing: error) }
    }

    func close() {
        pending?.timeoutTask?.cancel()
        if let p = pending {
            pending = nil
            p.continuation.resume(throwing: UniproxyError.closed)
        }
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        isOpen = false
        receiveLoopStarted = false
    }

    func synthesize(
        text: String,
        voice: String = "zahar",
        lang: String = "ru-RU",
        speed: Double = 1,
        emotion: String = "neutral"
    ) async throws -> (data: Data, mimeHint: String) {
        try await connect()
        var lastError: Error = UniproxyError.emptyAudio
        for format in Self.preferredFormats {
            do {
                let data = try await synthesizeOnce(
                    text: text,
                    voice: voice,
                    lang: lang,
                    speed: speed,
                    emotion: emotion,
                    format: format
                )
                return (data, format)
            } catch {
                lastError = error
                // reconnect after format/protocol glitch
                close()
                try await connect()
            }
        }
        throw lastError
    }

    private func synthesizeOnce(
        text: String,
        voice: String,
        lang: String,
        speed: Double,
        emotion: String,
        format: String
    ) async throws -> Data {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Data, Error>) in
            if pending != nil {
                cont.resume(throwing: UniproxyError.busy)
                return
            }
            let messageId = sendEvent(
                namespace: "tts",
                name: "Generate",
                payload: [
                    "text": text,
                    "lang": lang,
                    "voice": voice,
                    "speed": speed,
                    "emotion": emotion,
                    "format": format,
                ]
            )
            let timeout = Task {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                await self.failPending(UniproxyError.synthTimeout)
            }
            pending = PendingSynth(
                messageId: messageId,
                continuation: cont,
                timeoutTask: timeout
            )
        }
    }

    @discardableResult
    private func sendEvent(namespace: String, name: String, payload: [String: Any]) -> String {
        let messageId = UUID().uuidString.lowercased()
        var header: [String: Any] = [
            "namespace": namespace,
            "name": name,
            "messageId": messageId,
            "seqNumber": seq,
        ]
        seq += 1
        if let streamId = payload["streamId"] {
            header["streamId"] = streamId
        }
        var body = payload
        body.removeValue(forKey: "streamId")
        let packet: [String: Any] = [
            "event": [
                "header": header,
                "payload": body,
            ],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: packet),
              let text = String(data: data, encoding: .utf8),
              let task
        else { return messageId }
        task.send(.string(text)) { _ in }
        return messageId
    }

    private func receiveLoop() async {
        while let task {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    handleJSON(text)
                case .data(let data):
                    handleBinary(data)
                @unknown default:
                    break
                }
            } catch {
                isOpen = false
                failConnectIfNeeded(error)
                failPending(error)
                self.task = nil
                receiveLoopStarted = false
                break
            }
        }
    }

    private func handleJSON(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }

        if let directive = obj["directive"] as? [String: Any],
           let header = directive["header"] as? [String: Any],
           header["name"] as? String == "SynchronizeStateResponse"
        {
            isOpen = true
            let conts = connectContinuations
            connectContinuations.removeAll()
            conts.forEach { $0.resume() }
            return
        }

        guard var p = pending else { return }

        if let directive = obj["directive"] as? [String: Any] {
            let header = directive["header"] as? [String: Any] ?? [:]
            let ns = header["namespace"] as? String
            let name = header["name"] as? String
            if ns == "System", name == "EventException" || name == "InvalidAuth" {
                let payload = directive["payload"] as? [String: Any]
                let err = (payload?["error"] as? [String: Any])?["message"] as? String ?? name ?? "TTS error"
                failPending(UniproxyError.server(err))
                return
            }
            if ns == "TTS", name == "Speak",
               header["refMessageId"] as? String == p.messageId
            {
                if let sid = header["streamId"] as? UInt32 {
                    p.streamId = sid
                    pending = p
                } else if let sid = header["streamId"] as? Int {
                    p.streamId = UInt32(sid)
                    pending = p
                } else if let sid = header["streamId"] as? NSNumber {
                    p.streamId = sid.uint32Value
                    pending = p
                } else {
                    failPending(UniproxyError.server("нет streamId"))
                }
            }
            return
        }

        if let sc = obj["streamcontrol"] as? [String: Any] {
            let action = sc["action"]
            let isClose = (action as? Int) == 0 || (action as? String) == "close"
            guard isClose else { return }
            let sid: UInt32? = {
                if let v = sc["streamId"] as? UInt32 { return v }
                if let v = sc["streamId"] as? Int { return UInt32(v) }
                if let v = sc["streamId"] as? NSNumber { return v.uint32Value }
                return nil
            }()
            if let known = p.streamId, let sid, known != sid { return }
            finishPending()
        }
    }

    private func handleBinary(_ buf: Data) {
        guard var p = pending, buf.count >= 4 else { return }
        let sid = buf.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        if p.streamId == nil {
            p.streamId = sid
        }
        if p.streamId == sid {
            p.chunks.append(buf.dropFirst(4))
            pending = p
        }
    }

    private func finishPending() {
        guard let p = pending else { return }
        pending = nil
        p.timeoutTask?.cancel()
        var out = Data()
        for c in p.chunks { out.append(c) }
        if out.isEmpty {
            p.continuation.resume(throwing: UniproxyError.emptyAudio)
        } else {
            p.continuation.resume(returning: out)
        }
    }

    private func failPending(_ error: Error) {
        guard let p = pending else { return }
        pending = nil
        p.timeoutTask?.cancel()
        p.continuation.resume(throwing: error)
    }
}

enum UniproxyError: LocalizedError {
    case timeout
    case synthTimeout
    case emptyAudio
    case busy
    case closed
    case server(String)

    var errorDescription: String? {
        switch self {
        case .timeout: return "таймаут Uniproxy"
        case .synthTimeout: return "таймаут синтеза"
        case .emptyAudio: return "пустой ответ TTS"
        case .busy: return "TTS занят"
        case .closed: return "соединение закрыто"
        case .server(let m): return m
        }
    }
}
