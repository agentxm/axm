/**
 * Unit tests for `pack/manifest-keys-recognized`.
 *
 * Emits one error finding per unrecognized top-level key, including the
 * forbidden `packs:` dependency section (D015 violation surfaces at error
 * severity via the unknown-key enumeration).
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PackContent, PackFileAccessor, PackRuleContext } from "../../context.js";
import { manifestKeysRecognizedRule } from "./manifest-keys-recognized.js";

const absentAccessor: PackFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
};

const makeContext = (subject: PackContent): PackRuleContext => ({
  subject,
  files: absentAccessor,
  displayRoot: "",
});

const validManifest = {
  owner: "@acme",
  type: "pack",
  name: "utility-belt",
  version: "1.0.0",
  dependencies: {},
};

describe("pack/manifest-keys-recognized", () => {
  it.effect("produces zero findings when every key is recognized", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ packJson: validManifest }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("recognizes the metadata field", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({
          packJson: { ...validManifest, metadata: { "com.example/tool": { enabled: true } } },
        }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("emits one error finding per unknown top-level key", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({
          packJson: { ...validManifest, made_up: "x", another: 1 },
        }),
      );
      expect(findings).toHaveLength(2);
      expect(findings.every((f) => f.ruleId === "pack/manifest-keys-recognized")).toBe(true);
      expect(findings.every((f) => f.severity === "error")).toBe(true);
      expect(findings.every((f) => f.location?.file === "pack.json")).toBe(true);
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("made_up"))).toBe(true);
      expect(messages.some((m) => m.includes("another"))).toBe(true);
    }),
  );

  it.effect("flags a forbidden `packs:` dependency section at error severity", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({
          packJson: { ...validManifest, packs: { "@acme/packs/other": "^1.0.0" } },
        }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("pack/manifest-keys-recognized");
      expect(findings[0]?.severity).toBe("error");
      expect(findings[0]?.message).toContain("packs");
    }),
  );

  it.effect("early-returns zero findings when pack.json is absent", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ packJson: undefined }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("ignores non-object packJson", () =>
    Effect.gen(function* () {
      const findings = yield* manifestKeysRecognizedRule.check(
        makeContext({ packJson: "a string" }),
      );
      expect(findings).toEqual([]);
    }),
  );
});
