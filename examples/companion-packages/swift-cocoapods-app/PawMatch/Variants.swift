// Variant-flag enums and parsing helpers.

import Foundation

enum PetCardStyle: String {
    case compact
    case detailed
    case playful

    init(rawVariant value: String) throws {
        guard let style = PetCardStyle(rawValue: value) else {
            throw PawMatchError.unknownVariant(kind: "PetCardStyle", value: value)
        }
        self = style
    }
}

enum MatchStrategy: String {
    case popularity
    case matchQuiz = "match-quiz"
    case longestStay = "longest-stay"

    init(rawVariant value: String) throws {
        guard let strategy = MatchStrategy(rawValue: value) else {
            throw PawMatchError.unknownVariant(kind: "MatchStrategy", value: value)
        }
        self = strategy
    }
}

enum MatchDepth: String {
    case short
    case standard
    case thorough

    init(rawVariant value: String) throws {
        guard let depth = MatchDepth(rawValue: value) else {
            throw PawMatchError.unknownVariant(kind: "MatchDepth", value: value)
        }
        self = depth
    }
}

enum DonateFocus: String {
    case all
    case shelters
    case rescue
    case policy

    init(rawVariant value: String) throws {
        guard let focus = DonateFocus(rawValue: value) else {
            throw PawMatchError.unknownVariant(kind: "DonateFocus", value: value)
        }
        self = focus
    }
}

enum PawMatchError: Error, CustomStringConvertible {
    case unknownVariant(kind: String, value: String)

    var description: String {
        switch self {
        case let .unknownVariant(kind, value):
            return "Unknown \(kind) variant: '\(value)'"
        }
    }
}
