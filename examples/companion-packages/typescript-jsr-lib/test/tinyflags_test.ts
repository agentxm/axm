import { assertEquals, assertThrows } from "jsr:@std/assert@^1.0.0";

import { booleanFlag, tinyFlags, variantFlag } from "../src/index.ts";

Deno.test("boolean flags use defaults when no rollout is configured", () => {
  const flags = tinyFlags({
    checkoutRedesign: booleanFlag({ default: true }),
  });

  assertEquals(flags.enabled("checkoutRedesign", { userId: "user-1" }), true);
});

Deno.test("boolean rollout boundaries are deterministic", () => {
  const flags = tinyFlags({
    disabledExperiment: booleanFlag({ default: false, rollout: 0 }),
    enabledExperiment: booleanFlag({ default: false, rollout: 100 }),
  });

  assertEquals(flags.enabled("disabledExperiment", { userId: "user-1" }), false);
  assertEquals(flags.enabled("enabledExperiment", { userId: "user-1" }), true);
  assertEquals(
    flags.enabled("enabledExperiment", { userId: "user-1" }),
    flags.enabled("enabledExperiment", { userId: "user-1" }),
  );
});

Deno.test("variant flags return defaults outside rollout allocations", () => {
  const flags = tinyFlags({
    searchRanking: variantFlag(["classic", "semantic"], {
      default: "classic",
      rollout: { semantic: 0 },
    }),
  });

  assertEquals(flags.variant("searchRanking", { userId: "user-1" }), "classic");
});

Deno.test("variant flags can allocate all traffic to a variant", () => {
  const flags = tinyFlags({
    searchRanking: variantFlag(["classic", "semantic"], {
      default: "classic",
      rollout: { semantic: 100 },
    }),
  });

  assertEquals(flags.variant("searchRanking", { userId: "user-1" }), "semantic");
});

Deno.test("invalid flag definitions fail at construction time", () => {
  assertThrows(() => booleanFlag({ rollout: 101 }), RangeError);
  assertThrows(
    () => variantFlag(["classic", "semantic"], { default: "personalized" }),
    TypeError,
  );
  assertThrows(
    () =>
      variantFlag(["classic", "semantic"], {
        rollout: { semantic: 80, classic: 30 },
      }),
    RangeError,
  );
});
