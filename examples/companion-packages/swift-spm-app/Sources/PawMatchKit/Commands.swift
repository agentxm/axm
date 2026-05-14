// ArgumentParser command graph for `pawmatch`. Each subcommand is a thin
// adapter that forwards its parsed arguments to a method on
// `PawMatchRunner`, then exits with the runner's `RunResult.exitCode`.

import AgentXMExampleTinyFlags
import ArgumentParser
import Foundation

public struct PawMatchCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "pawmatch",
        abstract: "Community pet adoption CLI.",
        subcommands: [
            BrowseCommand.self,
            ShowCommand.self,
            MatchCommand.self,
            ApplyCommand.self,
            FeesCommand.self,
            ReturnSupportCommand.self,
            DonateCommand.self,
        ],
        defaultSubcommand: nil
    )

    public init() {}
}

/// Construct the default runner and exit with `RunResult.userError(...)` if
/// the TinyFlags bundle fails to build. Subcommands call this in `run()`.
func makeRunner() throws -> PawMatchRunner {
    do {
        return try PawMatchRunner.make()
    } catch {
        throw ValidationError("pawmatch: failed to build flag bundle: \(error)")
    }
}

func dispatch(_ result: RunResult) throws {
    switch result {
    case .ok:
        return
    case .userError:
        throw ExitCode(rawValue: 1)
    case .unexpected:
        throw ExitCode(rawValue: 2)
    }
}

// MARK: - browse

public struct BrowseCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "browse",
        abstract: "Browse adoptable pets."
    )

    @Option(name: .long, help: "Filter by species (dog|cat|rabbit|guinea-pig).")
    public var species: String?

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        try dispatch(runner.runBrowse(species: species))
    }
}

// MARK: - show

public struct ShowCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "show",
        abstract: "Show details for a pet."
    )

    @Argument(help: "Pet slug (see `pawmatch browse`).")
    public var pet: String

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        try dispatch(runner.runShow(slug: pet))
    }
}

// MARK: - match

public struct MatchCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "match",
        abstract: "Match pets to your lifestyle preferences."
    )

    @ArgumentParser.Flag(name: .long, help: "Family with children at home.")
    public var hasKids: Bool = false

    @ArgumentParser.Flag(name: .long, help: "Quiet, calm household.")
    public var quietHome: Bool = false

    @ArgumentParser.Flag(name: .long, help: "Active, outdoor lifestyle.")
    public var active: Bool = false

    @ArgumentParser.Flag(name: .long, help: "First-time pet adopter.")
    public var firstTime: Bool = false

    @ArgumentParser.Flag(name: .long, help: "Other pets in the home.")
    public var multiplePets: Bool = false

    @ArgumentParser.Flag(name: .long, help: "Small home or apartment.")
    public var smallHome: Bool = false

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        let prefs = MatchPreferences(
            hasKids: hasKids,
            quietHome: quietHome,
            active: active,
            firstTime: firstTime,
            multiplePets: multiplePets,
            smallHome: smallHome
        )
        try dispatch(runner.runMatch(prefs: prefs))
    }
}

// MARK: - apply

public struct ApplyCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "apply",
        abstract: "Start an adoption application for a pet."
    )

    @Argument(help: "Pet slug (see `pawmatch browse`).")
    public var pet: String

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        try dispatch(runner.runApply(slug: pet))
    }
}

// MARK: - fees

public struct FeesCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "fees",
        abstract: "Show transparent adoption fee breakdown."
    )

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        try dispatch(runner.runFees())
    }
}

// MARK: - return-support

public struct ReturnSupportCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "return-support",
        abstract: "Show the no-judgment return policy and post-adoption help."
    )

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        try dispatch(runner.runReturnSupport())
    }
}

// MARK: - donate

public struct DonateCommand: ParsableCommand {
    public static let configuration = CommandConfiguration(
        commandName: "donate",
        abstract: "Browse animal-welfare charities to donate to."
    )

    @Argument(help: "Optional charity slug. When omitted, lists all matching charities.")
    public var charity: String?

    @Option(name: .long, help: "Charity focus (all|shelters|rescue|policy).")
    public var focus: String?

    @ArgumentParser.Flag(name: .long, help: "Open the charity's donation URL in a browser.")
    public var open: Bool = false

    public init() {}

    public func run() throws {
        let runner = try makeRunner()
        try dispatch(runner.runDonate(
            charitySlug: charity,
            focusOverride: focus,
            openInBrowser: open
        ))
    }
}
