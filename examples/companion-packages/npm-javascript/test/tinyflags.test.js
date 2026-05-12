import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { booleanFlag, createFlags, variantFlag } from "../src/index.js";

describe("boolean flags", () => {
  it("use defaults when no rollout is configured", () => {
    const flags = createFlags({
      checkoutRedesign: booleanFlag({ default: true }),
    });

    assert.equal(flags.enabled("checkoutRedesign", { userId: "user-1" }), true);
  });

  it("rollout boundaries are deterministic", () => {
    const flags = createFlags({
      disabledExperiment: booleanFlag({ default: false, rollout: 0 }),
      enabledExperiment: booleanFlag({ default: false, rollout: 100 }),
    });

    assert.equal(flags.enabled("disabledExperiment", { userId: "user-1" }), false);
    assert.equal(flags.enabled("enabledExperiment", { userId: "user-1" }), true);
    assert.equal(
      flags.enabled("enabledExperiment", { userId: "user-1" }),
      flags.enabled("enabledExperiment", { userId: "user-1" }),
    );
  });
});

describe("variant flags", () => {
  it("return defaults outside rollout allocations", () => {
    const flags = createFlags({
      searchRanking: variantFlag(["classic", "semantic"], {
        default: "classic",
        rollout: { semantic: 0 },
      }),
    });

    assert.equal(flags.variant("searchRanking", { userId: "user-1" }), "classic");
  });

  it("can allocate all traffic to a variant", () => {
    const flags = createFlags({
      searchRanking: variantFlag(["classic", "semantic"], {
        default: "classic",
        rollout: { semantic: 100 },
      }),
    });

    assert.equal(flags.variant("searchRanking", { userId: "user-1" }), "semantic");
  });
});

describe("validation", () => {
  it("invalid flag definitions fail at construction time", () => {
    assert.throws(() => booleanFlag({ rollout: 101 }), RangeError);
    assert.throws(
      () => variantFlag(["classic", "semantic"], { default: "personalized" }),
      TypeError,
    );
    assert.throws(
      () => variantFlag(["classic", "semantic"], { rollout: { semantic: 80, classic: 30 } }),
      RangeError,
    );
  });
});
