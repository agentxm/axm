package ai.agentxm.examples.pawmatch

import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldContain
import java.io.ByteArrayOutputStream
import java.io.PrintStream

class PawMatchSpec : StringSpec({

    fun captureCli(block: PawMatchCli.() -> Int): Pair<Int, String> {
        val outStream = ByteArrayOutputStream()
        val errStream = ByteArrayOutputStream()
        val cli = PawMatchCli(
            out = PrintStream(outStream),
            err = PrintStream(errStream),
        )
        val code = cli.block()
        return code to outStream.toString()
    }

    "fees prints the heading and exits 0" {
        val (code, stdout) = captureCli { fees() }
        code shouldBe 0
        stdout shouldContain "Adoption fees"
    }

    "browse with no species lists pets" {
        val (code, stdout) = captureCli { browse(null) }
        code shouldBe 0
        stdout shouldContain "Biscuit"
    }

    "show returns 1 for an unknown pet" {
        val (code, _) = captureCli { show("nonexistent") }
        code shouldBe 1
    }

    "match prints a strategy line" {
        val (code, stdout) = captureCli { match(MatchPreferences(hasKids = true)) }
        code shouldBe 0
        stdout shouldContain "Strategy:"
    }

    "donate lists charities with default focus" {
        val (code, stdout) = captureCli { donate(null, null, openBrowser = false) }
        code shouldBe 0
        stdout shouldContain "Animal-welfare charities"
        stdout shouldContain "Best Friends Animal Society"
    }
})
