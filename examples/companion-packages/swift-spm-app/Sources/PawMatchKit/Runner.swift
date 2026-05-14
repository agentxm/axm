// PawMatchRunner — the testable core of the PawMatch CLI. Every subcommand
// in `Commands.swift` calls into a method here. The runner takes a
// `TinyFlags` bundle, an `EvaluationContext`, an output sink, and a URL
// opener so tests can substitute every dependency.

import AgentXMExampleTinyFlags
import Foundation

/// Result of a `Runner.runXxx(...)` call. Mirrors a process exit code.
public enum RunResult: Equatable {
    case ok
    case userError(String)
    case unexpected(String)

    public var exitCode: Int32 {
        switch self {
        case .ok: return 0
        case .userError: return 1
        case .unexpected: return 2
        }
    }
}

/// Captures the lifestyle preferences a user supplied to `pawmatch match`.
public struct MatchPreferences: Sendable, Equatable {
    public var hasKids: Bool
    public var quietHome: Bool
    public var active: Bool
    public var firstTime: Bool
    public var multiplePets: Bool
    public var smallHome: Bool

    public init(
        hasKids: Bool = false,
        quietHome: Bool = false,
        active: Bool = false,
        firstTime: Bool = false,
        multiplePets: Bool = false,
        smallHome: Bool = false
    ) {
        self.hasKids = hasKids
        self.quietHome = quietHome
        self.active = active
        self.firstTime = firstTime
        self.multiplePets = multiplePets
        self.smallHome = smallHome
    }

    public var isEmpty: Bool {
        !(hasKids || quietHome || active || firstTime || multiplePets || smallHome)
    }

    public var activeFactorNames: Set<String> {
        var result = Set<String>()
        if hasKids { result.insert("has-kids") }
        if quietHome { result.insert("quiet-home") }
        if active { result.insert("active") }
        if firstTime { result.insert("first-time") }
        if multiplePets { result.insert("multiple-pets") }
        if smallHome { result.insert("small-home") }
        return result
    }
}

public final class PawMatchRunner {

    public typealias URLOpener = (String) -> Bool

    public let flags: TinyFlags
    public let context: EvaluationContext
    public let output: PawMatchOutput
    public let openURL: URLOpener

    public init(
        flags: TinyFlags,
        context: EvaluationContext,
        output: PawMatchOutput,
        openURL: @escaping URLOpener = PawMatchRunner.defaultOpenURL
    ) {
        self.flags = flags
        self.context = context
        self.output = output
        self.openURL = openURL
    }

    /// Convenience constructor that builds the canonical TinyFlags bundle and
    /// reads the session id from the host environment.
    public static func make(
        output: PawMatchOutput = StandardOutput()
    ) throws -> PawMatchRunner {
        PawMatchRunner(
            flags: try PawMatchFlags.makeBundle(),
            context: PawMatchFlags.defaultContext(),
            output: output
        )
    }

    // MARK: - browse

    public func runBrowse(species: String?) -> RunResult {
        let pets = Pets.filter(species: species)
        if pets.isEmpty {
            output.writeLine("No adoptable pets found for species '\(species ?? "")'.")
            return .ok
        }

        do {
            let highlight = try flags.enabled(FlagKey.longStayHighlight, context: context)
            if highlight {
                let longStay = pets.filter(Pets.isLongStay)
                    .max { $0.daysInShelter < $1.daysInShelter }
                if let longStay {
                    output.writeLine("★ Featured long-stay friend — please consider \(longStay.name)!")
                    output.writeLine("")
                }
            }

            let raw = try flags.variant(FlagKey.petCardStyle, context: context)
            let style = try PetCardStyle.parse(raw)
            for pet in pets {
                renderPet(pet, style: style)
            }
            return .ok
        } catch {
            return reportFlagError(error)
        }
    }

    // MARK: - show

    public func runShow(slug: String) -> RunResult {
        guard let pet = Pets.find(slug: slug) else {
            output.writeError("Unknown pet '\(slug)'. Try 'pawmatch browse'.")
            return .userError("unknown pet")
        }
        renderPet(pet, style: .detailed)
        output.writeLine("  Needs: \(pet.needs)")
        let suffix = Pets.isLongStay(pet) ? " (long-stay)" : ""
        output.writeLine("  Days in shelter: \(pet.daysInShelter)\(suffix)")
        return .ok
    }

    // MARK: - match

    public func runMatch(prefs: MatchPreferences) -> RunResult {
        do {
            let strategyRaw = try flags.variant(FlagKey.recommendationStrategy, context: context)
            let strategy = try MatchStrategy.parse(strategyRaw)

            let depthRaw = try flags.variant(FlagKey.matchQuizDepth, context: context)
            let depth = try MatchDepth.parse(depthRaw)

            let factors = factorsForDepth(depth)
            let userFlags = prefs.activeFactorNames
            var wants = Set<String>()
            for factor in factors where userFlags.contains(factor.name) {
                wants.formUnion(factor.tags)
            }

            output.writeLine(
                "Strategy: \(strategy.rawValue) • Quiz depth: \(depth.rawValue) "
                + "(\(factors.count) factor(s) considered)"
            )
            if prefs.isEmpty {
                output.writeLine("(no preference flags provided — try --has-kids --quiet-home --active --first-time)")
            }
            output.writeLine("")

            var ranked = Pets.all
            switch strategy {
            case .popularity:
                ranked.sort { countTagMatches($0.tags, in: PawMatchRunner.popularityTags)
                    > countTagMatches($1.tags, in: PawMatchRunner.popularityTags) }
            case .longestStay:
                ranked.sort { $0.daysInShelter > $1.daysInShelter }
            case .matchQuiz:
                ranked.sort { countTagMatches($0.tags, in: wants)
                    > countTagMatches($1.tags, in: wants) }
            }

            for pet in ranked.prefix(3) {
                output.writeLine("  • \(pet.name) (\(pet.breed), \(pet.ageYears)y) — \(pet.tags.joined(separator: ", "))")
            }
            output.writeLine("")
            output.writeLine("Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
            return .ok
        } catch {
            return reportFlagError(error)
        }
    }

    // MARK: - apply

    public func runApply(slug: String) -> RunResult {
        guard let pet = Pets.find(slug: slug) else {
            output.writeError("Unknown pet '\(slug)'. Try 'pawmatch browse'.")
            return .userError("unknown pet")
        }

        output.writeLine("Adoption application for \(pet.name)")
        output.writeLine("")
        output.writeLine("Next steps:")
        output.writeLine("  1. Application reviewed by an adoption counselor (1–2 days).")
        output.writeLine("  2. Meet-and-greet scheduled at the shelter.")
        output.writeLine("  3. 48-hour reflection period before finalizing.")
        output.writeLine("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

        do {
            let followup = try flags.enabled(FlagKey.homeCheckFollowup, context: context)
            if followup {
                output.writeLine("  5. Two-week follow-up check from a counselor to see how you're settling in.")
            }

            output.writeLine("")
            output.writeLine("Returns are always accepted, no questions asked.")

            let suggestDonate = try flags.enabled(FlagKey.suggestDonateAfterAdoption, context: context)
            if suggestDonate {
                output.writeLine("")
                output.writeLine("If \(pet.name) brings you joy, please consider donating to a shelter:")
                output.writeLine("  pawmatch donate")
            }
            return .ok
        } catch {
            return reportFlagError(error)
        }
    }

    // MARK: - fees

    public func runFees() -> RunResult {
        do {
            let detailed = try flags.enabled(FlagKey.feeBreakdownDetailed, context: context)
            output.writeLine("Adoption fees")
            output.writeLine("")
            if detailed {
                output.writeLine("  Dog adoption — $150 total:")
                output.writeLine("    $60   spay / neuter surgery")
                output.writeLine("    $45   core vaccinations")
                output.writeLine("    $25   microchip and registration")
                output.writeLine("    $20   intake exam and deworming")
                output.writeLine("")
                output.writeLine("  Cat adoption — $90 total:")
                output.writeLine("    $50   spay / neuter surgery")
                output.writeLine("    $25   core vaccinations")
                output.writeLine("    $15   microchip and registration")
                output.writeLine("")
                output.writeLine("  Small animal — $35 total (intake exam + microchip).")
            } else {
                output.writeLine("  Dog adoption           $150")
                output.writeLine("  Cat adoption            $90")
                output.writeLine("  Small animal            $35")
                output.writeLine("")
                output.writeLine("  Fees cover spay/neuter, vaccines, and microchip.")
            }
            output.writeLine("")
            output.writeLine("No one is turned away for inability to pay — ask about our subsidy fund.")
            return .ok
        } catch {
            return reportFlagError(error)
        }
    }

    // MARK: - return-support

    public func runReturnSupport() -> RunResult {
        output.writeLine("Return support")
        output.writeLine("")
        output.writeLine("If your adoption isn't working out, we're here to help.")
        output.writeLine("  • Free behavior consultation with our trainers.")
        output.writeLine("  • No-judgment returns at any time — your pet stays in our care.")
        output.writeLine("  • Connections to low-cost vet and food assistance programs.")
        output.writeLine("")
        output.writeLine("Returning a pet is not a failure. Reach out as soon as you'd like support.")
        return .ok
    }

    // MARK: - donate

    public func runDonate(
        charitySlug: String?,
        focusOverride: String?,
        openInBrowser: Bool
    ) -> RunResult {
        do {
            let defaultFocusRaw = try flags.variant(FlagKey.donateFocusDefault, context: context)
            let defaultFocus = try DonateFocus.parse(defaultFocusRaw)
            let focus = focusOverride ?? defaultFocus.rawValue

            let showRatings = try flags.enabled(FlagKey.showCharityRatings, context: context)

            if let slug = charitySlug {
                guard let charity = Charities.find(slug: slug) else {
                    output.writeError("Unknown charity '\(slug)'.")
                    return .userError("unknown charity")
                }
                if openInBrowser {
                    let ok = openURL(charity.url)
                    if !ok {
                        output.writeError("Unable to open browser. URL: \(charity.url)")
                        return .userError("opener failed")
                    }
                    return .ok
                }
                renderCharity(charity, showRatings: showRatings)
                return .ok
            }

            let list = Charities.filter(focus: focus)
            output.writeLine("Animal-welfare charities (focus: \(focus))")
            output.writeLine("")
            for charity in list {
                renderCharity(charity, showRatings: showRatings)
                output.writeLine("")
            }
            output.writeLine(Charities.disclaimer)
            if !showRatings {
                output.writeLine("Ratings hidden — set show-charity-ratings to surface them inline.")
            }
            return .ok
        } catch {
            return reportFlagError(error)
        }
    }

    // MARK: - rendering

    private func renderPet(_ pet: Pet, style: PetCardStyle) {
        let badge = Pets.isLongStay(pet) ? " ★" : ""
        switch style {
        case .compact:
            let slug = pet.slug.padding(toLength: 10, withPad: " ", startingAt: 0)
            let name = pet.name.padding(toLength: 14, withPad: " ", startingAt: 0)
            let species = pet.species.padding(toLength: 10, withPad: " ", startingAt: 0)
            output.writeLine("  \(slug) \(name) \(species) \(pet.ageYears)y\(badge)")
        case .playful:
            let breed = pet.breed.lowercased()
            let traits = pet.tags.joined(separator: " & ")
            output.writeLine("  🐾 \(pet.name)\(badge) — a \(pet.ageYears)-year-old \(breed) who is \(traits).")
        case .detailed:
            output.writeLine("  \(pet.name)\(badge)  [\(pet.slug)]")
            output.writeLine("    \(pet.breed), \(pet.ageYears) years old")
            output.writeLine("    Tags: \(pet.tags.joined(separator: ", "))")
            output.writeLine("")
        }
    }

    private func renderCharity(_ charity: Charity, showRatings: Bool) {
        output.writeLine("  \(charity.name)  [\(charity.slug)]")
        output.writeLine("    Focus: \(charity.focus)")
        output.writeLine("    \(charity.description)")
        output.writeLine("    Donate: \(charity.url)")
        if showRatings {
            output.writeLine("    Rating: \(charity.ratingNote)")
        }
    }

    // MARK: - helpers

    private struct Factor {
        let name: String
        let tags: [String]
    }

    private static let allFactors: [Factor] = [
        Factor(name: "has-kids", tags: ["good-with-kids", "gentle"]),
        Factor(name: "quiet-home", tags: ["mellow", "calm", "solo", "lap-cat"]),
        Factor(name: "active", tags: ["high-energy", "playful"]),
        Factor(name: "first-time", tags: ["gentle", "calm", "low-energy"]),
        Factor(name: "multiple-pets", tags: ["social"]),
        Factor(name: "small-home", tags: ["lap-cat", "solo", "low-energy"]),
    ]

    private static let popularityTags: Set<String> = [
        "social", "good-with-kids", "calm", "mellow", "gentle",
    ]

    private func factorsForDepth(_ depth: MatchDepth) -> [Factor] {
        let take: Int
        switch depth {
        case .short: take = 2
        case .standard: take = 4
        case .thorough: take = 6
        }
        let bounded = min(take, PawMatchRunner.allFactors.count)
        return Array(PawMatchRunner.allFactors.prefix(bounded))
    }

    private func countTagMatches(_ tags: [String], in target: Set<String>) -> Int {
        tags.reduce(0) { partial, tag in target.contains(tag) ? partial + 1 : partial }
    }

    private func reportFlagError(_ error: Error) -> RunResult {
        output.writeError("pawmatch: \(error)")
        return .userError("flag error")
    }

    public static func defaultOpenURL(_ url: String) -> Bool {
        #if os(macOS)
        return Process.launch(executable: "/usr/bin/open", arguments: [url])
        #elseif os(Linux)
        return Process.launch(executable: "/usr/bin/xdg-open", arguments: [url])
        #else
        return false
        #endif
    }
}

private extension Process {
    /// Launch a process detached, returning whether the launch itself
    /// succeeded. The caller does not wait for the spawned process.
    static func launch(executable: String, arguments: [String]) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        do {
            try process.run()
            return true
        } catch {
            return false
        }
    }
}
