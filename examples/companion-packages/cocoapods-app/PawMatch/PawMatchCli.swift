// PawMatch CLI — community pet adoption command-line tool.
//
// Wires every TinyFlags flag declared in `Flags.swift` into at least one
// command path so the companion skills (add-flag, rollout-review,
// cleanup-flag) have realistic targets.

import AgentXMExampleTinyFlags
import Foundation

#if canImport(AppKit)
import AppKit
#endif

final class PawMatchCli {
    typealias OpenUrl = (String) -> Bool

    private static let allFactors: [(flag: String, tags: [String])] = [
        ("has-kids",      ["good-with-kids", "gentle"]),
        ("quiet-home",    ["mellow", "calm", "solo", "lap-cat"]),
        ("active",        ["high-energy", "playful"]),
        ("first-time",    ["gentle", "calm", "low-energy"]),
        ("multiple-pets", ["social"]),
        ("small-home",    ["lap-cat", "solo", "low-energy"]),
    ]

    private static let popularityTags: Set<String> =
        ["social", "good-with-kids", "calm", "mellow", "gentle"]

    private let flags: TinyFlags
    private let context: EvaluationContext
    private let stdout: TextOutputStreamWriter
    private let stderr: TextOutputStreamWriter
    private let openUrl: OpenUrl

    init(
        flags: TinyFlags,
        context: EvaluationContext,
        stdout: TextOutputStreamWriter,
        stderr: TextOutputStreamWriter,
        openUrl: @escaping OpenUrl = PawMatchCli.defaultOpenUrl
    ) {
        self.flags = flags
        self.context = context
        self.stdout = stdout
        self.stderr = stderr
        self.openUrl = openUrl
    }

    /// Entry point. Returns a POSIX-style exit code.
    func run(_ args: [String]) -> Int {
        guard let command = args.first else {
            printHelp()
            return 1
        }

        if command == "--help" || command == "-h" || command == "help" {
            printHelp()
            return 0
        }

        let rest = Array(args.dropFirst())
        switch command {
        case "browse":         return browse(rest)
        case "show":           return show(rest)
        case "match":          return match(rest)
        case "apply":          return apply(rest)
        case "fees":           return fees()
        case "return-support": return returnSupport()
        case "donate":         return donate(rest)
        default:
            stderr.writeLine("unknown command: \(command)")
            printHelp(to: stderr)
            return 2
        }
    }

    // MARK: - Commands

    private func browse(_ args: [String]) -> Int {
        let species = optionValue(args, name: "--species")
        let pets = Pets.filterBySpecies(species)
        if pets.isEmpty {
            stdout.writeLine("No adoptable pets found for species '\(species ?? "")'.")
            return 0
        }

        do {
            if try flags.enabled(PawMatchFlag.longStayHighlight, context: context) {
                let longStay = pets
                    .filter { $0.isLongStay }
                    .max { $0.daysInShelter < $1.daysInShelter }
                if let longStay {
                    stdout.writeLine("\u{2605} Featured long-stay friend — please consider \(longStay.name)!")
                    stdout.writeLine("")
                }
            }
            let styleRaw = try flags.variant(PawMatchFlag.petCardStyle, context: context)
            let style = try PetCardStyle(rawVariant: styleRaw)
            for pet in pets {
                renderPet(pet, style: style)
            }
            return 0
        } catch {
            stderr.writeLine("browse failed: \(error)")
            return 1
        }
    }

    private func show(_ args: [String]) -> Int {
        guard let slug = args.first else {
            stderr.writeLine("Usage: pawmatch show <pet>")
            return 1
        }
        guard let pet = Pets.findBySlug(slug) else {
            stderr.writeLine("Unknown pet '\(slug)'. Try 'pawmatch browse'.")
            return 1
        }

        renderPet(pet, style: .detailed)
        stdout.writeLine("  Needs: \(pet.needs)")
        let longStayNote = pet.isLongStay ? " (long-stay)" : ""
        stdout.writeLine("  Days in shelter: \(pet.daysInShelter)\(longStayNote)")
        return 0
    }

    private func match(_ args: [String]) -> Int {
        var preferences = MatchPreferences()
        for arg in args {
            switch arg {
            case "--has-kids":      preferences.hasKids = true
            case "--quiet-home":    preferences.quietHome = true
            case "--active":        preferences.active = true
            case "--first-time":    preferences.firstTime = true
            case "--multiple-pets": preferences.multiplePets = true
            case "--small-home":    preferences.smallHome = true
            default:
                stderr.writeLine("match: unknown flag '\(arg)'")
                return 1
            }
        }

        do {
            let strategy = try MatchStrategy(rawVariant:
                try flags.variant(PawMatchFlag.recommendationStrategy, context: context))
            let depth = try MatchDepth(rawVariant:
                try flags.variant(PawMatchFlag.matchQuizDepth, context: context))
            let factors = factors(forDepth: depth)
            let userFlags = preferences.activeFlags()
            var wants = Set<String>()
            for factor in factors where userFlags.contains(factor.flag) {
                for tag in factor.tags { wants.insert(tag) }
            }

            stdout.writeLine(
                "Strategy: \(strategy.rawValue) • Quiz depth: \(depth.rawValue) (\(factors.count) factor(s) considered)"
            )
            if preferences.isEmpty {
                stdout.writeLine("(no preference flags provided — try --has-kids --quiet-home --active --first-time)")
            }
            stdout.writeLine("")

            let ranked: [Pet]
            switch strategy {
            case .popularity:
                ranked = Pets.all.sorted {
                    $0.tags.filter(Self.popularityTags.contains).count
                        > $1.tags.filter(Self.popularityTags.contains).count
                }
            case .longestStay:
                ranked = Pets.all.sorted { $0.daysInShelter > $1.daysInShelter }
            case .matchQuiz:
                ranked = Pets.all.sorted {
                    $0.tags.filter(wants.contains).count > $1.tags.filter(wants.contains).count
                }
            }

            for pet in ranked.prefix(3) {
                stdout.writeLine(
                    "  • \(pet.name) (\(pet.breed), \(pet.ageYears)y) — \(pet.tags.joined(separator: ", "))"
                )
            }
            stdout.writeLine("")
            stdout.writeLine("Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
            return 0
        } catch {
            stderr.writeLine("match failed: \(error)")
            return 1
        }
    }

    private func apply(_ args: [String]) -> Int {
        guard let slug = args.first else {
            stderr.writeLine("Usage: pawmatch apply <pet>")
            return 1
        }
        guard let pet = Pets.findBySlug(slug) else {
            stderr.writeLine("Unknown pet '\(slug)'. Try 'pawmatch browse'.")
            return 1
        }

        stdout.writeLine("Adoption application for \(pet.name)")
        stdout.writeLine("")
        stdout.writeLine("Next steps:")
        stdout.writeLine("  1. Application reviewed by an adoption counselor (1–2 days).")
        stdout.writeLine("  2. Meet-and-greet scheduled at the shelter.")
        stdout.writeLine("  3. 48-hour reflection period before finalizing.")
        stdout.writeLine("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

        do {
            if try flags.enabled(PawMatchFlag.homeCheckFollowup, context: context) {
                stdout.writeLine("  5. Two-week follow-up check from a counselor to see how you're settling in.")
            }

            stdout.writeLine("")
            stdout.writeLine("Returns are always accepted, no questions asked.")

            if try flags.enabled(PawMatchFlag.suggestDonateAfterAdoption, context: context) {
                stdout.writeLine("")
                stdout.writeLine("If \(pet.name) brings you joy, please consider donating to a shelter:")
                stdout.writeLine("  pawmatch donate")
            }
            return 0
        } catch {
            stderr.writeLine("apply failed: \(error)")
            return 1
        }
    }

    private func fees() -> Int {
        stdout.writeLine("Adoption fees")
        stdout.writeLine("")
        do {
            if try flags.enabled(PawMatchFlag.feeBreakdownDetailed, context: context) {
                stdout.writeLine("  Dog adoption — $150 total:")
                stdout.writeLine("    $60   spay / neuter surgery")
                stdout.writeLine("    $45   core vaccinations")
                stdout.writeLine("    $25   microchip and registration")
                stdout.writeLine("    $20   intake exam and deworming")
                stdout.writeLine("")
                stdout.writeLine("  Cat adoption — $90 total:")
                stdout.writeLine("    $50   spay / neuter surgery")
                stdout.writeLine("    $25   core vaccinations")
                stdout.writeLine("    $15   microchip and registration")
                stdout.writeLine("")
                stdout.writeLine("  Small animal — $35 total (intake exam + microchip).")
            } else {
                stdout.writeLine("  Dog adoption           $150")
                stdout.writeLine("  Cat adoption            $90")
                stdout.writeLine("  Small animal            $35")
                stdout.writeLine("")
                stdout.writeLine("  Fees cover spay/neuter, vaccines, and microchip.")
            }
            stdout.writeLine("")
            stdout.writeLine("No one is turned away for inability to pay — ask about our subsidy fund.")
            return 0
        } catch {
            stderr.writeLine("fees failed: \(error)")
            return 1
        }
    }

    private func returnSupport() -> Int {
        stdout.writeLine("Return support")
        stdout.writeLine("")
        stdout.writeLine("If your adoption isn't working out, we're here to help.")
        stdout.writeLine("  • Free behavior consultation with our trainers.")
        stdout.writeLine("  • No-judgment returns at any time — your pet stays in our care.")
        stdout.writeLine("  • Connections to low-cost vet and food assistance programs.")
        stdout.writeLine("")
        stdout.writeLine("Returning a pet is not a failure. Reach out as soon as you'd like support.")
        return 0
    }

    private func donate(_ args: [String]) -> Int {
        // Parse optional positional slug + optional --focus / --open.
        var slug: String? = nil
        var focusOverride: String? = nil
        var openFlag = false
        var i = 0
        while i < args.count {
            let arg = args[i]
            switch arg {
            case "--open":
                openFlag = true
            case "--focus":
                guard i + 1 < args.count else {
                    stderr.writeLine("donate: --focus requires a value (all|shelters|rescue|policy).")
                    return 1
                }
                focusOverride = args[i + 1]
                i += 1
            default:
                if arg.hasPrefix("--") {
                    stderr.writeLine("donate: unknown flag '\(arg)'")
                    return 1
                }
                slug = arg
            }
            i += 1
        }

        do {
            let defaultFocus = try DonateFocus(rawVariant:
                try flags.variant(PawMatchFlag.donateFocusDefault, context: context))
            let focus = focusOverride ?? defaultFocus.rawValue
            let showRatings = try flags.enabled(PawMatchFlag.showCharityRatings, context: context)

            if let slug {
                guard let charity = Charities.findBySlug(slug) else {
                    stderr.writeLine("Unknown charity '\(slug)'.")
                    return 1
                }
                if openFlag {
                    return openUrl(charity.url) ? 0 : 1
                }
                renderCharity(charity, showRatings: showRatings)
                return 0
            }

            let list = Charities.filterByFocus(focus)
            stdout.writeLine("Animal-welfare charities (focus: \(focus))")
            stdout.writeLine("")
            for charity in list {
                renderCharity(charity, showRatings: showRatings)
                stdout.writeLine("")
            }
            stdout.writeLine(Charities.disclaimer)
            if !showRatings {
                stdout.writeLine("Ratings hidden — set show-charity-ratings to surface them inline.")
            }
            return 0
        } catch {
            stderr.writeLine("donate failed: \(error)")
            return 1
        }
    }

    // MARK: - Rendering

    private func renderPet(_ pet: Pet, style: PetCardStyle) {
        let longStayBadge = pet.isLongStay ? " \u{2605}" : ""
        switch style {
        case .compact:
            let slugCol = pet.slug.padding(toLength: 10, withPad: " ", startingAt: 0)
            let nameCol = pet.name.padding(toLength: 14, withPad: " ", startingAt: 0)
            let speciesCol = pet.species.padding(toLength: 10, withPad: " ", startingAt: 0)
            stdout.writeLine("  \(slugCol) \(nameCol) \(speciesCol) \(pet.ageYears)y\(longStayBadge)")
        case .playful:
            stdout.writeLine(
                "  🐾 \(pet.name)\(longStayBadge) — a \(pet.ageYears)-year-old \(pet.breed.lowercased()) who is \(pet.tags.joined(separator: " & "))."
            )
        case .detailed:
            stdout.writeLine("  \(pet.name)\(longStayBadge)  [\(pet.slug)]")
            stdout.writeLine("    \(pet.breed), \(pet.ageYears) years old")
            stdout.writeLine("    Tags: \(pet.tags.joined(separator: ", "))")
            stdout.writeLine("")
        }
    }

    private func renderCharity(_ charity: Charity, showRatings: Bool) {
        stdout.writeLine("  \(charity.name)  [\(charity.slug)]")
        stdout.writeLine("    Focus: \(charity.focus)")
        stdout.writeLine("    \(charity.description)")
        stdout.writeLine("    Donate: \(charity.url)")
        if showRatings {
            stdout.writeLine("    Rating: \(charity.ratingNote)")
        }
    }

    private func factors(forDepth depth: MatchDepth) -> [(flag: String, tags: [String])] {
        let take: Int
        switch depth {
        case .short:    take = 2
        case .standard: take = 4
        case .thorough: take = Self.allFactors.count
        }
        return Array(Self.allFactors.prefix(take))
    }

    private func optionValue(_ args: [String], name: String) -> String? {
        var i = 0
        while i < args.count {
            if args[i] == name, i + 1 < args.count {
                return args[i + 1]
            }
            i += 1
        }
        return nil
    }

    private func printHelp(to writer: TextOutputStreamWriter? = nil) {
        let w = writer ?? stdout
        w.writeLine("pawmatch — community pet adoption CLI.")
        w.writeLine("")
        w.writeLine("Usage:")
        w.writeLine("  pawmatch browse [--species <s>]")
        w.writeLine("  pawmatch show <pet>")
        w.writeLine("  pawmatch match [--has-kids --quiet-home --active --first-time --multiple-pets --small-home]")
        w.writeLine("  pawmatch apply <pet>")
        w.writeLine("  pawmatch fees")
        w.writeLine("  pawmatch return-support")
        w.writeLine("  pawmatch donate [--focus all|shelters|rescue|policy]")
        w.writeLine("  pawmatch donate <slug> --open")
    }

    static func defaultOpenUrl(_ url: String) -> Bool {
        #if canImport(AppKit)
        if let parsed = URL(string: url) {
            return NSWorkspace.shared.open(parsed)
        }
        return false
        #else
        // Non-AppKit platforms: print the URL and let the caller decide.
        return false
        #endif
    }
}

// MARK: - Output abstraction

/// A minimal stream-writer abstraction so tests can capture output without
/// importing the production AppKit-flavored helpers.
protocol TextOutputStreamWriter: AnyObject {
    func writeLine(_ value: String)
}

final class FileHandleWriter: TextOutputStreamWriter {
    private let handle: FileHandle
    init(_ handle: FileHandle) { self.handle = handle }
    func writeLine(_ value: String) {
        if let data = (value + "\n").data(using: .utf8) {
            handle.write(data)
        }
    }
}

final class BufferWriter: TextOutputStreamWriter {
    private(set) var contents: String = ""
    func writeLine(_ value: String) { contents += value + "\n" }
}
