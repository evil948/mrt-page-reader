import AVFoundation
import Foundation

/// Demux Ogg Opus (Yandex Uniproxy) and decode to WAV via Core Audio Opus (iOS 15+).
enum OggOpusDecoder {
    struct Head {
        var channels: UInt32 = 1
        var sampleRate: Double = 48_000
        var preSkip: UInt16 = 0
    }

    static func oggOpusToWAV(_ ogg: Data) throws -> Data {
        let (head, packets) = try demux(ogg)
        guard !packets.isEmpty else { throw DecodeError.emptyPackets }
        let pcm = try decodePackets(packets, head: head)
        return wavFromPCM16(pcm, sampleRate: head.sampleRate, channels: Int(head.channels))
    }

    private static func demux(_ data: Data) throws -> (Head, [Data]) {
        var offset = 0
        var head = Head()
        var packets: [Data] = []
        var sawHead = false
        var sawTags = false
        var pending = Data()

        while offset + 27 <= data.count {
            if !(data[offset] == 0x4F && data[offset + 1] == 0x67
                && data[offset + 2] == 0x67 && data[offset + 3] == 0x53)
            {
                offset += 1
                continue
            }

            let segmentCount = Int(data[offset + 26])
            let tableStart = offset + 27
            guard tableStart + segmentCount <= data.count else { break }

            var bodySize = 0
            var segs: [Int] = []
            for i in 0..<segmentCount {
                let s = Int(data[tableStart + i])
                segs.append(s)
                bodySize += s
            }
            let bodyStart = tableStart + segmentCount
            guard bodyStart + bodySize <= data.count else { break }

            var bodyOff = bodyStart
            for s in segs {
                pending.append(data.subdata(in: bodyOff..<(bodyOff + s)))
                bodyOff += s
                if s < 255 {
                    let packet = pending
                    pending = Data()
                    if !sawHead {
                        if packet.starts(with: Data("OpusHead".utf8)) {
                            head = parseHead(packet)
                            sawHead = true
                        }
                    } else if !sawTags {
                        if packet.starts(with: Data("OpusTags".utf8)) {
                            sawTags = true
                        }
                    } else if !packet.isEmpty {
                        packets.append(packet)
                    }
                }
            }

            offset = bodyStart + bodySize
        }

        guard sawHead else { throw DecodeError.noOpusHead }
        return (head, packets)
    }

    private static func parseHead(_ packet: Data) -> Head {
        var head = Head()
        guard packet.count >= 19 else { return head }
        head.channels = UInt32(max(1, packet[9]))
        head.preSkip = UInt16(packet[10]) | (UInt16(packet[11]) << 8)
        head.sampleRate = 48_000
        return head
    }

    private static func decodePackets(_ packets: [Data], head: Head) throws -> Data {
        var inputASBD = AudioStreamBasicDescription(
            mSampleRate: head.sampleRate,
            mFormatID: kAudioFormatOpus,
            mFormatFlags: 0,
            mBytesPerPacket: 0,
            mFramesPerPacket: 0,
            mBytesPerFrame: 0,
            mChannelsPerFrame: head.channels,
            mBitsPerChannel: 0,
            mReserved: 0
        )
        var outputASBD = AudioStreamBasicDescription(
            mSampleRate: head.sampleRate,
            mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
            mBytesPerPacket: 2 * head.channels,
            mFramesPerPacket: 1,
            mBytesPerFrame: 2 * head.channels,
            mChannelsPerFrame: head.channels,
            mBitsPerChannel: 16,
            mReserved: 0
        )

        guard let inFormat = AVAudioFormat(streamDescription: &inputASBD),
              let outFormat = AVAudioFormat(streamDescription: &outputASBD),
              let converter = AVAudioConverter(from: inFormat, to: outFormat)
        else {
            throw DecodeError.converterUnavailable
        }

        var pcmAll = Data()

        for packet in packets {
            let maxPacket = max(packet.count, 1)
            guard let compressed = AVAudioCompressedBuffer(
                format: inFormat,
                packetCapacity: 1,
                maximumPacketSize: maxPacket
            ) else { continue }

            packet.withUnsafeBytes { raw in
                guard let base = raw.baseAddress else { return }
                memcpy(compressed.data, base, packet.count)
            }
            compressed.byteLength = UInt32(packet.count)
            compressed.packetCount = 1
            compressed.packetDescriptions?.pointee = AudioStreamPacketDescription(
                mStartOffset: 0,
                mVariableFramesInPacket: 960,
                mDataByteSize: UInt32(packet.count)
            )

            guard let pcmBuf = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: 5760) else {
                continue
            }

            var fed = false
            var error: NSError?
            let status = converter.convert(to: pcmBuf, error: &error) { _, outStatus in
                if fed {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                fed = true
                outStatus.pointee = .haveData
                return compressed
            }
            if let error { throw error }
            if status == .error { throw DecodeError.decodeFailed }
            guard pcmBuf.frameLength > 0, let ch = pcmBuf.int16ChannelData else { continue }
            let bytes = Int(pcmBuf.frameLength) * Int(outFormat.streamDescription.pointee.mBytesPerFrame)
            pcmAll.append(Data(bytes: ch[0], count: bytes))
        }

        if pcmAll.isEmpty { throw DecodeError.emptyPCM }
        let skipBytes = Int(head.preSkip) * Int(head.channels) * 2
        if skipBytes > 0, skipBytes < pcmAll.count {
            pcmAll.removeSubrange(0..<skipBytes)
        }
        return pcmAll
    }

    private static func wavFromPCM16(_ pcm: Data, sampleRate: Double, channels: Int) -> Data {
        var data = Data()
        let sr = UInt32(sampleRate)
        let ch = UInt16(channels)
        let bits: UInt16 = 16
        let byteRate = sr * UInt32(ch) * UInt32(bits / 8)
        let blockAlign = ch * (bits / 8)
        let dataSize = UInt32(pcm.count)

        func append(_ s: String) { data.append(contentsOf: s.utf8) }
        func appendU16(_ v: UInt16) {
            var le = v.littleEndian
            withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
        }
        func appendU32(_ v: UInt32) {
            var le = v.littleEndian
            withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
        }

        append("RIFF"); appendU32(36 + dataSize); append("WAVE")
        append("fmt "); appendU32(16); appendU16(1); appendU16(ch)
        appendU32(sr); appendU32(byteRate); appendU16(blockAlign); appendU16(bits)
        append("data"); appendU32(dataSize); data.append(pcm)
        return data
    }

    enum DecodeError: LocalizedError {
        case noOpusHead, emptyPackets, converterUnavailable, decodeFailed, emptyPCM

        var errorDescription: String? {
            switch self {
            case .noOpusHead: return "не найден OpusHead"
            case .emptyPackets: return "нет Opus-пакетов"
            case .converterUnavailable: return "нет декодера Opus на устройстве"
            case .decodeFailed: return "ошибка декода Opus"
            case .emptyPCM: return "пустой PCM после декода"
            }
        }
    }
}
