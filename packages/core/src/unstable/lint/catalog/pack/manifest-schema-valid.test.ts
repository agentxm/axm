/**
 * Unit tests for `pack/manifest-schema-valid`.
 *
 * Delegates to `Schema.decodeUnknownResult(PackManifestSchema)` with
 * `onExcessProperty: "ignore"` and `errors: "all"`. Tests cover:
 *
 * - Happy path: fully valid manifest.
 * - Required-field missing (`version`).
 * - Bad `version` (not SemVer).
 * - Bad `owner` (not a handle).
 * - Bad `name` (uppercase).
 * - Dependency-map FQN grammar violation.
 * - Bad `VersionRange` strings.
 * - Excess keys are ignored at this rule (keys-recognized owns them).
 * - No manifest: zero findings.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PackContent, PackFileAccessor, PackRuleContext } from "../../context.js";
import { manifestSchemaValidRule } from "./manifest-schema-valid.js";

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
  description: "a sample pack",
};

describe("pack/manifest-schema-valid", () => {
  it.effect("produces zero findings for a fully valid manifest", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ packJson: validManifest }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("produces zero findings when pack manifest is absent", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(makeContext({ packJson: undefined }));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("flags a missing required field", () =>
    Effect.gen(function* () {
      const { version: _omitted, ...without } = validManifest;
      const findings = yield* manifestSchemaValidRule.check(makeContext({ packJson: without }));
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.every((f) => f.ruleId === "pack/manifest-schema-valid")).toBe(true);
      expect(findings.every((f) => f.severity === "error")).toBe(true);
      expect(findings[0]?.location?.file).toBe("pack.json");
    }),
  );

  it.effect("flags an invalid SemVer version", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ packJson: { ...validManifest, version: "not-semver" } }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.severity).toBe("error");
    }),
  );

  it.effect("flags a bad owner handle", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ packJson: { ...validManifest, owner: "no-at-sign" } }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
    }),
  );

  it.effect("flags an invalid extension name", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ packJson: { ...validManifest, name: "UPPERCASE" } }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
    }),
  );

  it.effect("flags a malformed dependency-map FQN", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({
          packJson: {
            ...validManifest,
            // FQN must be `@owner/<plural>/<name>`; "bare-name" violates grammar.
            skills: { "bare-name": "^1.0.0" },
          },
        }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.every((f) => f.severity === "error")).toBe(true);
    }),
  );

  it.effect("flags a bad VersionRange string", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({
          packJson: {
            ...validManifest,
            skills: { "@acme/skills/example": "not-a-semver-range" },
          },
        }),
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.every((f) => f.severity === "error")).toBe(true);
    }),
  );

  it.effect("ignores excess top-level keys (keys-recognized owns them)", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({ packJson: { ...validManifest, unknown_field: "x" } }),
      );
      expect(findings).toEqual([]);
    }),
  );

  it.effect("accumulates findings for multiple independent issues", () =>
    Effect.gen(function* () {
      const findings = yield* manifestSchemaValidRule.check(
        makeContext({
          packJson: { ...validManifest, version: "bad", name: "UPPERCASE" },
        }),
      );
      // Expect at least two findings since `errors: "all"` accumulates.
      expect(findings.length).toBeGreaterThanOrEqual(2);
    }),
  );
});
