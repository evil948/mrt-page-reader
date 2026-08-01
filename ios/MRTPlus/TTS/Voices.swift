import Foundation

struct VoiceInfo: Identifiable, Hashable {
    let id: String
    let label: String
}

enum VoiceCatalog {
    static let defaultID = "zahar"

    static let all: [VoiceInfo] = [
        .init(id: "zahar", label: "Zahar"),
        .init(id: "ermil", label: "Ermil"),
        .init(id: "ermilov", label: "Ermilov"),
        .init(id: "oksana", label: "Oksana"),
        .init(id: "jane", label: "Jane"),
        .init(id: "omazh", label: "Omazh"),
        .init(id: "nastya", label: "Nastya"),
        .init(id: "sasha", label: "Sasha"),
        .init(id: "alyss", label: "Alyss"),
        .init(id: "kolya", label: "Kolya"),
        .init(id: "kostya", label: "Kostya"),
        .init(id: "anton_samokhvalov", label: "Anton"),
        .init(id: "tatyana_shitova", label: "Alice"),
        .init(id: "tatyana_abramova", label: "Tatyana"),
    ]

    static func label(for id: String) -> String {
        all.first { $0.id == id }?.label ?? id
    }
}
