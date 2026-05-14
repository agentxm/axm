package ai.agentxm.examples.pawmatch

import munit.FunSuite
import java.io.{ByteArrayOutputStream, PrintStream}

final class PawMatchSuite extends FunSuite:

  private def captureCli(block: PawMatchCli => Int): (Int, String) =
    val outStream = ByteArrayOutputStream()
    val errStream = ByteArrayOutputStream()
    val cli = PawMatchCli(
      out = PrintStream(outStream),
      err = PrintStream(errStream),
    )
    val code = block(cli)
    (code, outStream.toString)

  test("fees prints the heading and exits 0") {
    val (code, stdout) = captureCli(_.fees())
    assertEquals(code, 0)
    assert(stdout.contains("Adoption fees"))
  }

  test("browse with no species lists pets") {
    val (code, stdout) = captureCli(_.browse(None))
    assertEquals(code, 0)
    assert(stdout.contains("Biscuit"))
  }

  test("show returns 1 for an unknown pet") {
    val (code, _) = captureCli(_.show("nonexistent"))
    assertEquals(code, 1)
  }

  test("match prints a strategy line") {
    val (code, stdout) =
      captureCli(_.doMatch(MatchPreferences(hasKids = true)))
    assertEquals(code, 0)
    assert(stdout.contains("Strategy:"))
  }

  test("donate lists charities with default focus") {
    val (code, stdout) =
      captureCli(_.donate(None, None, openBrowser = false))
    assertEquals(code, 0)
    assert(stdout.contains("Animal-welfare charities"))
    assert(stdout.contains("Best Friends Animal Society"))
  }

  test("unknown command exits 1") {
    val outStream = ByteArrayOutputStream()
    val errStream = ByteArrayOutputStream()
    val cli = PawMatchCli(
      out = PrintStream(outStream),
      err = PrintStream(errStream),
    )
    val code = cli.run(Array("not-a-command"))
    assertEquals(code, 1)
    assert(errStream.toString.contains("Unknown command"))
  }
