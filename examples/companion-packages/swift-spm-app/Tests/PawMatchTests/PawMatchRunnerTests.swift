// XCTest suite for PawMatchRunner. Tests inject a `BufferOutput` and a stub
// URL opener so they can assert on rendered text and exit results without
// launching subprocesses.

import XCTest
import AgentXMExampleTinyFlags
@testable import PawMatchKit

private func makeRunner(
    output: BufferOutput,
    openURL: @escaping PawMatchRunner.URLOpener = { _ in true }
) throws -> PawMatchRunner {
    PawMatchRunner(
        flags: try PawMatchFlags.makeBundle(),
        context: EvaluationContext.session("test-session"),
        output: output,
        openURL: openURL
    )
}

final class PawMatchRunnerTests: XCTestCase {

    func test_feesExitsOkAndRendersHeader() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runFees()
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Adoption fees"))
    }

    func test_returnSupportExitsOkAndRendersHeader() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runReturnSupport()
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Return support"))
    }

    func test_browseListsCanonicalPets() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runBrowse(species: nil)
        XCTAssertEqual(result, .ok)
        for name in ["Biscuit", "Pepper", "Marigold"] {
            XCTAssertTrue(output.stdout.contains(name), "expected \(name) in output")
        }
    }

    func test_browseFiltersBySpecies() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runBrowse(species: "cat")
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Pepper"))
        XCTAssertFalse(output.stdout.contains("Biscuit"))
    }

    func test_showKnownPetSucceeds() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runShow(slug: "biscuit")
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Biscuit"))
    }

    func test_showUnknownPetExitsUserError() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runShow(slug: "no-such-pet")
        XCTAssertEqual(result.exitCode, 1)
        XCTAssertTrue(output.stderr.contains("Unknown pet"))
    }

    func test_matchEmptyPrefsHintsAtFlags() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runMatch(prefs: MatchPreferences())
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Strategy:"))
        XCTAssertTrue(output.stdout.contains("no preference flags provided"))
    }

    func test_matchWithPrefsHidesHint() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let prefs = MatchPreferences(hasKids: true, quietHome: true)
        let result = runner.runMatch(prefs: prefs)
        XCTAssertEqual(result, .ok)
        XCTAssertFalse(output.stdout.contains("no preference flags provided"))
    }

    func test_applyKnownPetRendersHeader() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runApply(slug: "biscuit")
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Adoption application for Biscuit"))
    }

    func test_applyUnknownPetExitsUserError() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runApply(slug: "no-such-pet")
        XCTAssertEqual(result.exitCode, 1)
        XCTAssertTrue(output.stderr.contains("Unknown pet"))
    }

    func test_donateListsCharitiesAndShowsDisclaimer() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runDonate(charitySlug: nil, focusOverride: nil, openInBrowser: false)
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Animal-welfare charities"))
        XCTAssertTrue(output.stdout.contains(Charities.disclaimer))
    }

    func test_donateFiltersByFocus() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runDonate(
            charitySlug: nil,
            focusOverride: "rescue",
            openInBrowser: false
        )
        XCTAssertEqual(result, .ok)
        XCTAssertTrue(output.stdout.contains("Brother Wolf"))
        XCTAssertFalse(output.stdout.contains("ASPCA"))
    }

    func test_donateOpenInvokesOpener() throws {
        let output = BufferOutput()
        var opened: String?
        let runner = try makeRunner(output: output) { url in
            opened = url
            return true
        }
        let result = runner.runDonate(
            charitySlug: "brother-wolf",
            focusOverride: nil,
            openInBrowser: true
        )
        XCTAssertEqual(result, .ok)
        XCTAssertNotNil(opened)
    }

    func test_donateUnknownCharityExitsUserError() throws {
        let output = BufferOutput()
        let runner = try makeRunner(output: output)
        let result = runner.runDonate(
            charitySlug: "no-such-charity",
            focusOverride: nil,
            openInBrowser: false
        )
        XCTAssertEqual(result.exitCode, 1)
        XCTAssertTrue(output.stderr.contains("Unknown charity"))
    }
}
