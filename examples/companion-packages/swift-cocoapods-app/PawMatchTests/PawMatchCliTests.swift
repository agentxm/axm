// XCTest suite for the PawMatch CLI. Each test exercises a command flow
// against in-memory stdout/stderr buffers so the assertions stay independent
// of the surrounding shell.

import XCTest
import AgentXMExampleTinyFlags
@testable import PawMatch

final class PawMatchCliTests: XCTestCase {

    private func makeCli() throws -> (PawMatchCli, BufferWriter, BufferWriter) {
        let flags = try PawMatchFlag.makeTinyFlags()
        let stdout = BufferWriter()
        let stderr = BufferWriter()
        let cli = PawMatchCli(
            flags: flags,
            context: EvaluationContext.session("test-user"),
            stdout: stdout,
            stderr: stderr,
            openUrl: { _ in true }
        )
        return (cli, stdout, stderr)
    }

    func testFeesExitsZero() throws {
        let (cli, stdout, stderr) = try makeCli()
        let code = cli.run(["fees"])
        XCTAssertEqual(code, 0, "stderr: \(stderr.contents)")
        XCTAssertTrue(stdout.contents.contains("Adoption fees"))
    }

    func testReturnSupportExitsZero() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["return-support"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Return support"))
    }

    func testBrowseLists() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["browse"])
        XCTAssertEqual(code, 0)
        for name in ["Biscuit", "Pepper", "Marigold"] {
            XCTAssertTrue(stdout.contents.contains(name), "browse missing \(name)")
        }
    }

    func testBrowseFiltersBySpecies() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["browse", "--species", "cat"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Pepper"))
        XCTAssertFalse(stdout.contents.contains("Biscuit"))
    }

    func testShowKnownPet() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["show", "biscuit"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Biscuit"))
    }

    func testShowUnknownPetExitsOne() throws {
        let (cli, _, stderr) = try makeCli()
        let code = cli.run(["show", "no-such-pet"])
        XCTAssertEqual(code, 1)
        XCTAssertTrue(stderr.contents.contains("Unknown pet"))
    }

    func testMatchEmptyPreferences() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["match"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Strategy:"))
        XCTAssertTrue(stdout.contents.contains("(no preference flags provided"))
    }

    func testMatchWithPreferences() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["match", "--has-kids", "--quiet-home"])
        XCTAssertEqual(code, 0)
        XCTAssertFalse(stdout.contents.contains("(no preference flags provided"))
    }

    func testApplyKnownPet() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["apply", "biscuit"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Adoption application for Biscuit"))
    }

    func testApplyUnknownPetExitsOne() throws {
        let (cli, _, stderr) = try makeCli()
        let code = cli.run(["apply", "no-such-pet"])
        XCTAssertEqual(code, 1)
        XCTAssertTrue(stderr.contents.contains("Unknown pet"))
    }

    func testDonateListIncludesDisclaimer() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["donate"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Animal-welfare charities"))
        XCTAssertTrue(stdout.contents.contains(Charities.disclaimer))
    }

    func testDonateFiltersByFocus() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["donate", "--focus", "rescue"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("Brother Wolf"))
        XCTAssertFalse(stdout.contents.contains("ASPCA"))
    }

    func testDonateOpenInvokesOpenUrl() throws {
        let flags = try PawMatchFlag.makeTinyFlags()
        let stdout = BufferWriter()
        let stderr = BufferWriter()
        var opened: String = ""
        let cli = PawMatchCli(
            flags: flags,
            context: EvaluationContext.session("test-user"),
            stdout: stdout,
            stderr: stderr,
            openUrl: { url in opened = url; return true }
        )

        let code = cli.run(["donate", "brother-wolf", "--open"])
        XCTAssertEqual(code, 0)
        XCTAssertFalse(opened.isEmpty, "openUrl was not invoked")
    }

    func testDonateUnknownCharityExitsOne() throws {
        let (cli, _, stderr) = try makeCli()
        let code = cli.run(["donate", "no-such-charity"])
        XCTAssertEqual(code, 1)
        XCTAssertTrue(stderr.contents.contains("Unknown charity"))
    }

    func testUnknownCommandExitsTwo() throws {
        let (cli, _, stderr) = try makeCli()
        let code = cli.run(["nonsense"])
        XCTAssertEqual(code, 2)
        XCTAssertTrue(stderr.contents.contains("unknown command"))
    }

    func testHelpExitsZero() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run(["--help"])
        XCTAssertEqual(code, 0)
        XCTAssertTrue(stdout.contents.contains("pawmatch — community pet adoption CLI."))
    }

    func testNoArgsPrintsHelpAndExitsOne() throws {
        let (cli, stdout, _) = try makeCli()
        let code = cli.run([])
        XCTAssertEqual(code, 1)
        XCTAssertTrue(stdout.contents.contains("pawmatch — community pet adoption CLI."))
    }
}
