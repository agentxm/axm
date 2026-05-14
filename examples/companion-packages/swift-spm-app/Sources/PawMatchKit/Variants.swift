// Typed variant enums for the TinyFlags variant values. The CLI parses each
// raw string returned by `TinyFlags.variant(...)` into one of these enums so
// switch statements over command branches stay exhaustive.

import Foundation

public enum PetCardStyle: String, CaseIterable, Sendable {
    case compact
    case detailed
    case playful

    public static func parse(_ raw: String) throws -> PetCardStyle {
        guard let value = PetCardStyle(rawValue: raw) else {
            throw VariantParseError.unknown(name: "pet-card-style", raw: raw)
        }
        return value
    }
}

public enum MatchStrategy: String, CaseIterable, Sendable {
    case popularity
    case matchQuiz = "match-quiz"
    case longestStay = "longest-stay"

    public static func parse(_ raw: String) throws -> MatchStrategy {
        guard let value = MatchStrategy(rawValue: raw) else {
            throw VariantParseError.unknown(name: "recommendation-strategy", raw: raw)
        }
        return value
    }
}

public enum MatchDepth: String, CaseIterable, Sendable {
    case short
    case standard
    case thorough

    public static func parse(_ raw: String) throws -> MatchDepth {
        guard let value = MatchDepth(rawValue: raw) else {
            throw VariantParseError.unknown(name: "match-quiz-depth", raw: raw)
        }
        return value
    }
}

public enum DonateFocus: String, CaseIterable, Sendable {
    case all
    case shelters
    case rescue

    public static func parse(_ raw: String) throws -> DonateFocus {
        guard let value = DonateFocus(rawValue: raw) else {
            throw VariantParseError.unknown(name: "donate-focus-default", raw: raw)
        }
        return value
    }
}

public enum VariantParseError: Error, CustomStringConvertible, Equatable {
    case unknown(name: String, raw: String)

    public var description: String {
        switch self {
        case let .unknown(name, raw):
            return "pawmatch: unknown \(name) variant '\(raw)'"
        }
    }
}
