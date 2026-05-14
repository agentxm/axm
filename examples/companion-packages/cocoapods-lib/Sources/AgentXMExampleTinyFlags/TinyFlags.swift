// AgentXMExampleTinyFlags
//
// A tiny feature flags library used by the AXM companion-package CocoaPods
// example. Boolean flags have a default and an optional integer rollout
// percentage. Variant flags have a list of allowed values, a default, and an
// optional per-variant rollout allocation. Rollout bucketing is deterministic
// for a given (flag-name, context) pair.

import Foundation

/// Errors thrown when constructing or evaluating a TinyFlags definition.
public enum TinyFlagsError: Error, CustomStringConvertible, Equatable {
    case invalidPercentage(label: String, value: Int)
    case emptyVariantList
    case duplicateVariant(String)
    case emptyVariantName
    case unknownDefaultVariant(String)
    case unknownRolloutVariant(String)
    case rolloutTotalExceedsOneHundred(Int)
    case duplicateFlag(String)
    case unknownFlag(String)
    case wrongKind(name: String, expected: String)

    public var description: String {
        switch self {
        case let .invalidPercentage(label, value):
            return "\(label): percentage \(value) is outside [0, 100]"
        case .emptyVariantList:
            return "TinyFlags: variant list must not be empty"
        case let .duplicateVariant(name):
            return "TinyFlags: duplicate variant '\(name)'"
        case .emptyVariantName:
            return "TinyFlags: variant names must be non-empty"
        case let .unknownDefaultVariant(name):
            return "TinyFlags: default '\(name)' is not a declared variant"
        case let .unknownRolloutVariant(name):
            return "TinyFlags: rollout references unknown variant '\(name)'"
        case let .rolloutTotalExceedsOneHundred(total):
            return "TinyFlags: rollout total \(total) exceeds 100"
        case let .duplicateFlag(name):
            return "TinyFlags: duplicate flag definition '\(name)'"
        case let .unknownFlag(name):
            return "TinyFlags: unknown flag '\(name)'"
        case let .wrongKind(name, expected):
            return "TinyFlags: flag '\(name)' is not a \(expected) flag"
        }
    }
}

/// A single flag definition. Construct with ``Flag/boolean(default:rollout:)``
/// or ``Flag/variant(_:default:rollout:)``.
public enum Flag: Sendable, Equatable {
    case boolean(BooleanDefinition)
    case variant(VariantDefinition)

    /// A boolean flag.
    public struct BooleanDefinition: Sendable, Equatable {
        public let defaultValue: Bool
        /// Rollout percentage in `[0, 100]`. `nil` means the default value is
        /// returned for every caller.
        public let rollout: Int?
    }

    /// A variant flag.
    public struct VariantDefinition: Sendable, Equatable {
        public let variants: [String]
        public let defaultValue: String
        /// Per-variant rollout allocation. Variants not present in this map
        /// receive zero allocation. The total of all percentages must not
        /// exceed 100. `nil` means the default value is returned for every
        /// caller.
        public let rollout: [String: Int]?
    }

    /// Construct a boolean flag. The default value must be supplied
    /// explicitly to avoid relying on a Swift implicit-zero default.
    public static func boolean(default defaultValue: Bool, rollout: Int? = nil) throws -> Flag {
        if let rollout {
            try validatePercentage(rollout, label: "boolean rollout")
        }
        return .boolean(BooleanDefinition(defaultValue: defaultValue, rollout: rollout))
    }

    /// Construct a variant flag. `variants` must be non-empty and contain
    /// unique non-empty names. `defaultValue` must be one of `variants`. If
    /// `rollout` is supplied, every key must be a declared variant and the
    /// values must sum to at most 100.
    public static func variant(
        _ variants: [String],
        default defaultValue: String,
        rollout: [String: Int]? = nil
    ) throws -> Flag {
        if variants.isEmpty { throw TinyFlagsError.emptyVariantList }
        var seen = Set<String>()
        for variant in variants {
            if variant.isEmpty { throw TinyFlagsError.emptyVariantName }
            if !seen.insert(variant).inserted {
                throw TinyFlagsError.duplicateVariant(variant)
            }
        }
        if !seen.contains(defaultValue) {
            throw TinyFlagsError.unknownDefaultVariant(defaultValue)
        }
        if let rollout {
            var total = 0
            for (name, percent) in rollout {
                if !seen.contains(name) {
                    throw TinyFlagsError.unknownRolloutVariant(name)
                }
                try validatePercentage(percent, label: "rollout[\(name)]")
                total += percent
            }
            if total > 100 {
                throw TinyFlagsError.rolloutTotalExceedsOneHundred(total)
            }
        }
        return .variant(VariantDefinition(
            variants: variants,
            defaultValue: defaultValue,
            rollout: rollout
        ))
    }
}

/// A typed evaluation result returned by ``TinyFlags/evaluate(_:context:)``.
public enum FlagValue: Sendable, Equatable {
    case bool(Bool)
    case variant(String)
}

/// Caller identity used for deterministic rollout bucketing. An empty
/// ``identifier`` maps every caller to the same shared "anonymous" bucket.
public struct EvaluationContext: Sendable, Equatable {
    public let identifier: String

    public init(identifier: String = "") {
        self.identifier = identifier
    }

    /// Convenience constructor when callers want to be explicit about a
    /// session identifier (the term used across other TinyFlags ports).
    public static func session(_ session: String) -> EvaluationContext {
        EvaluationContext(identifier: session)
    }
}

/// A bundle of named flag definitions. Use ``Builder`` (or
/// ``TinyFlags/init(definitions:)``) to construct one, then call
/// ``enabled(_:context:)``, ``variant(_:context:)``, or
/// ``evaluate(_:context:)``.
public struct TinyFlags: Sendable {
    private let definitions: [String: Flag]
    /// Stable iteration order — variant rollout iteration must be
    /// deterministic in the order variants were declared (handled per-flag);
    /// this is for ``names``.
    public let names: [String]

    public init(definitions: [(String, Flag)]) throws {
        var ordered: [String] = []
        var table: [String: Flag] = [:]
        ordered.reserveCapacity(definitions.count)
        table.reserveCapacity(definitions.count)
        for (name, flag) in definitions {
            if table.updateValue(flag, forKey: name) != nil {
                throw TinyFlagsError.duplicateFlag(name)
            }
            ordered.append(name)
        }
        self.definitions = table
        self.names = ordered
    }

    /// Returns the registered definition for `name`.
    public func definition(_ name: String) throws -> Flag {
        guard let flag = definitions[name] else {
            throw TinyFlagsError.unknownFlag(name)
        }
        return flag
    }

    /// Evaluate a boolean flag.
    public func enabled(_ name: String, context: EvaluationContext) throws -> Bool {
        let flag = try definition(name)
        guard case let .boolean(def) = flag else {
            throw TinyFlagsError.wrongKind(name: name, expected: "boolean")
        }
        guard let rollout = def.rollout else { return def.defaultValue }
        return bucket(for: name, context: context) < rollout
    }

    /// Evaluate a variant flag.
    public func variant(_ name: String, context: EvaluationContext) throws -> String {
        let flag = try definition(name)
        guard case let .variant(def) = flag else {
            throw TinyFlagsError.wrongKind(name: name, expected: "variant")
        }
        guard let rollout = def.rollout else { return def.defaultValue }

        let bucketValue = bucket(for: name, context: context)
        var upperBound = 0
        for variant in def.variants {
            guard let percent = rollout[variant] else { continue }
            upperBound += percent
            if bucketValue < upperBound {
                return variant
            }
        }
        return def.defaultValue
    }

    /// Evaluate a flag of either kind, returning a typed ``FlagValue``.
    public func evaluate(_ name: String, context: EvaluationContext) throws -> FlagValue {
        let flag = try definition(name)
        switch flag {
        case .boolean:
            return .bool(try enabled(name, context: context))
        case .variant:
            return .variant(try variant(name, context: context))
        }
    }

    /// Builder for ``TinyFlags`` bundles.
    public final class Builder {
        private var entries: [(String, Flag)] = []
        private var registered = Set<String>()

        public init() {}

        @discardableResult
        public func register(_ name: String, _ flag: Flag) throws -> Builder {
            if !registered.insert(name).inserted {
                throw TinyFlagsError.duplicateFlag(name)
            }
            entries.append((name, flag))
            return self
        }

        @discardableResult
        public func boolean(
            _ name: String,
            default defaultValue: Bool,
            rollout: Int? = nil
        ) throws -> Builder {
            try register(name, try Flag.boolean(default: defaultValue, rollout: rollout))
        }

        @discardableResult
        public func variant(
            _ name: String,
            variants: [String],
            default defaultValue: String,
            rollout: [String: Int]? = nil
        ) throws -> Builder {
            try register(name, try Flag.variant(variants, default: defaultValue, rollout: rollout))
        }

        public func build() throws -> TinyFlags {
            try TinyFlags(definitions: entries)
        }
    }

    public static func builder() -> Builder { Builder() }
}

// MARK: - Internals

private func validatePercentage(_ value: Int, label: String) throws {
    if value < 0 || value > 100 {
        throw TinyFlagsError.invalidPercentage(label: label, value: value)
    }
}

private func bucket(for name: String, context: EvaluationContext) -> Int {
    let key = context.identifier.isEmpty ? "anonymous" : context.identifier
    let hash = fnv1a32(name + ":" + key)
    return Int(hash % 100)
}

/// FNV-1a 32-bit hash so bucketing is identical to the other TinyFlags ports.
private func fnv1a32(_ value: String) -> UInt32 {
    var hash: UInt32 = 2_166_136_261
    let prime: UInt32 = 16_777_619
    for byte in value.utf8 {
        hash ^= UInt32(byte)
        hash = hash &* prime
    }
    return hash
}
