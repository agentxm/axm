import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { HookContent, HookFileAccessor, HookRuleContext } from "../../context.js";
import { matcherRawPortabilityRule } from "./matcher-raw-portability.js";

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

const makeContext = (subject: HookContent): HookRuleContext => ({
  subject,
  files: absentAccessor,
  displayRoot: "",
});

const validManifest = {
  owner: "@acme",
  type: "hook",
  name: "tool-audit",
  version: "1.0.0",
  runtime: "bash",
  entrypoint: "src/hook.sh",
} as const;

describe("hook/matcher-raw-portability", () => {
  it.effect("warns for raw native matchers", () =>
    Effect.gen(function* () {
      const findings = yield* matcherRawPortabilityRule.check(
        makeContext({
          hookJson: {
            ...validManifest,
            bindings: [{ on: "tool.pre", matcherRaw: "Write|Edit" }],
          },
        }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe("warning");
    }),
  );

  it.effect("does not warn for structured canonical tool matchers", () =>
    Effect.gen(function* () {
      const findings = yield* matcherRawPortabilityRule.check(
        makeContext({
          hookJson: {
            ...validManifest,
            bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
          },
        }),
      );

      expect(findings).toEqual([]);
    }),
  );
});
