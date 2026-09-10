import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { HookFileAccessor, HookRuleContext } from "../../context.js";
import { hookRules as publishHookRules } from "../../publish.js";
import { decisionPortabilityRule } from "./decision-portability.js";

const absentAccessor: HookFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
};

const context = (decision: "observe" | "block" | "modify"): HookRuleContext => ({
  subject: {
    hookJson: {
      owner: "@acme",
      type: "hook",
      name: "check",
      version: "1.0.0",
      runtime: "bash",
      entrypoint: "src/hook.sh",
      bindings: [{ on: "tool.pre", requires: { decision: { kind: decision } } }],
    },
  },
  files: absentAccessor,
  displayRoot: "",
});

describe("hook/decision-portability", () => {
  it("runs in publish validation as the same advisory rule", () => {
    expect(publishHookRules.map(({ id }) => id)).toContain("hook/decision-portability");
  });

  it.effect("warns with the affected binding when a hard decision narrows support", () =>
    Effect.gen(function* () {
      const findings = yield* decisionPortabilityRule.check(context("block"));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("bindings[0]");
      expect(findings[0]?.message).toContain("cannot use advisory fallback");
    }),
  );

  it.effect("does not warn for observational bindings", () =>
    Effect.gen(function* () {
      expect(yield* decisionPortabilityRule.check(context("observe"))).toEqual([]);
    }),
  );
});
