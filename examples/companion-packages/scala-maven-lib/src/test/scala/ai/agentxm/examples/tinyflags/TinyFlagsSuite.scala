package ai.agentxm.examples.tinyflags

import munit.FunSuite

final class TinyFlagsSuite extends FunSuite:

  private val context = Context("user-1")

  test("boolean flags use defaults when no rollout is configured") {
    val flags = createFlags(
      "checkoutRedesign" -> booleanFlag(default = true),
    )

    assertEquals(flags.enabled("checkoutRedesign", context), true)
  }

  test("boolean rollout boundaries are deterministic") {
    val flags = createFlags(
      "disabledExperiment" -> booleanFlag(default = false, rollout = Some(0)),
      "enabledExperiment" -> booleanFlag(default = false, rollout = Some(100)),
    )

    assertEquals(flags.enabled("disabledExperiment", context), false)
    assertEquals(flags.enabled("enabledExperiment", context), true)
    assertEquals(
      flags.enabled("enabledExperiment", context),
      flags.enabled("enabledExperiment", context),
    )
  }

  test("boolean rollout at 50 is stable for the same context") {
    val flags = createFlags(
      "halfRollout" -> booleanFlag(default = false, rollout = Some(50)),
    )

    val first = flags.enabled("halfRollout", context)
    val second = flags.enabled("halfRollout", context)
    assertEquals(first, second)
  }

  test("variant flags return the default outside rollout allocations") {
    val flags = createFlags(
      "searchRanking" -> variantFlag(
        variants = List("classic", "semantic"),
        default = Some("classic"),
        rollout = Some(Map("semantic" -> 0)),
      ),
    )

    assertEquals(flags.variant("searchRanking", context), "classic")
  }

  test("variant flags can allocate all traffic to a variant") {
    val flags = createFlags(
      "searchRanking" -> variantFlag(
        variants = List("classic", "semantic"),
        default = Some("classic"),
        rollout = Some(Map("semantic" -> 100)),
      ),
    )

    assertEquals(flags.variant("searchRanking", context), "semantic")
  }

  test("evaluate returns a typed FlagValue for each kind") {
    val flags = createFlags(
      "checkoutRedesign" -> booleanFlag(default = true),
      "searchRanking" -> variantFlag(
        variants = List("classic", "semantic"),
        rollout = Some(Map("semantic" -> 100)),
      ),
    )

    assertEquals(flags.evaluate("checkoutRedesign", context), FlagValue.Bool(true))
    assertEquals(flags.evaluate("searchRanking", context), FlagValue.Variant("semantic"))
  }

  test("boolean rollout above 100 fails at construction time") {
    intercept[IllegalArgumentException] {
      booleanFlag(default = false, rollout = Some(101))
    }
  }

  test("variant default must be one of the variants") {
    intercept[IllegalArgumentException] {
      variantFlag(
        variants = List("classic", "semantic"),
        default = Some("personalized"),
      )
    }
  }

  test("variant rollout totals above 100 fail at construction time") {
    intercept[IllegalArgumentException] {
      variantFlag(
        variants = List("classic", "semantic"),
        default = Some("classic"),
        rollout = Some(Map("semantic" -> 80, "classic" -> 30)),
      )
    }
  }

  test("variant rollout that references unknown variants fails at construction time") {
    intercept[IllegalArgumentException] {
      variantFlag(
        variants = List("classic", "semantic"),
        default = Some("classic"),
        rollout = Some(Map("personalized" -> 10)),
      )
    }
  }

  test("unknown flag lookups throw NoSuchElementException") {
    val flags = createFlags(
      "checkoutRedesign" -> booleanFlag(default = true),
    )

    intercept[NoSuchElementException] {
      flags.enabled("unknown", context)
    }
  }

  test("calling enabled on a variant flag is an error") {
    val flags = createFlags(
      "searchRanking" -> variantFlag(
        variants = List("classic", "semantic"),
      ),
    )

    intercept[IllegalStateException] {
      flags.enabled("searchRanking", context)
    }
  }
