package ai.agentxm.examples.tinyflags

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.core.spec.style.StringSpec
import io.kotest.matchers.shouldBe

class TinyFlagsSpec : StringSpec({

    val context = Context("user-1")

    "boolean flags use defaults when no rollout is configured" {
        val flags = createFlags(
            "checkoutRedesign" to booleanFlag(default = true),
        )

        flags.enabled("checkoutRedesign", context) shouldBe true
    }

    "boolean rollout boundaries are deterministic" {
        val flags = createFlags(
            "disabledExperiment" to booleanFlag(default = false, rollout = 0),
            "enabledExperiment" to booleanFlag(default = false, rollout = 100),
        )

        flags.enabled("disabledExperiment", context) shouldBe false
        flags.enabled("enabledExperiment", context) shouldBe true
        flags.enabled("enabledExperiment", context) shouldBe
            flags.enabled("enabledExperiment", context)
    }

    "boolean rollout at 50 is stable for the same context" {
        val flags = createFlags(
            "halfRollout" to booleanFlag(default = false, rollout = 50),
        )

        val first = flags.enabled("halfRollout", context)
        val second = flags.enabled("halfRollout", context)
        first shouldBe second
    }

    "variant flags return the default outside rollout allocations" {
        val flags = createFlags(
            "searchRanking" to variantFlag(
                variants = listOf("classic", "semantic"),
                default = "classic",
                rollout = mapOf("semantic" to 0),
            ),
        )

        flags.variant("searchRanking", context) shouldBe "classic"
    }

    "variant flags can allocate all traffic to a variant" {
        val flags = createFlags(
            "searchRanking" to variantFlag(
                variants = listOf("classic", "semantic"),
                default = "classic",
                rollout = mapOf("semantic" to 100),
            ),
        )

        flags.variant("searchRanking", context) shouldBe "semantic"
    }

    "evaluate returns a typed FlagValue for each kind" {
        val flags = createFlags(
            "checkoutRedesign" to booleanFlag(default = true),
            "searchRanking" to variantFlag(
                variants = listOf("classic", "semantic"),
                rollout = mapOf("semantic" to 100),
            ),
        )

        flags.evaluate("checkoutRedesign", context) shouldBe FlagValue.Bool(true)
        flags.evaluate("searchRanking", context) shouldBe FlagValue.Variant("semantic")
    }

    "boolean rollout above 100 fails at construction time" {
        shouldThrow<IllegalArgumentException> {
            booleanFlag(default = false, rollout = 101)
        }
    }

    "variant default must be one of the variants" {
        shouldThrow<IllegalArgumentException> {
            variantFlag(
                variants = listOf("classic", "semantic"),
                default = "personalized",
            )
        }
    }

    "variant rollout totals above 100 fail at construction time" {
        shouldThrow<IllegalArgumentException> {
            variantFlag(
                variants = listOf("classic", "semantic"),
                default = "classic",
                rollout = mapOf("semantic" to 80, "classic" to 30),
            )
        }
    }

    "variant rollout that references unknown variants fails at construction time" {
        shouldThrow<IllegalArgumentException> {
            variantFlag(
                variants = listOf("classic", "semantic"),
                default = "classic",
                rollout = mapOf("personalized" to 10),
            )
        }
    }

    "unknown flag lookups throw NoSuchElementException" {
        val flags = createFlags(
            "checkoutRedesign" to booleanFlag(default = true),
        )

        shouldThrow<NoSuchElementException> {
            flags.enabled("unknown", context)
        }
    }

    "calling enabled on a variant flag is an error" {
        val flags = createFlags(
            "searchRanking" to variantFlag(
                variants = listOf("classic", "semantic"),
            ),
        )

        shouldThrow<IllegalStateException> {
            flags.enabled("searchRanking", context)
        }
    }
})
