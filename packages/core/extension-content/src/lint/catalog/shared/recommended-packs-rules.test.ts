/**
 * Unit tests for the shared `standalone` / `recommendedPacks` rule factories.
 *
 * Both rules read a manifest and nothing else, so a single synthetic context
 * kind covers the logic every catalog registers. The per-catalog wiring —
 * namespace, manifest filename, manifest accessor — is pinned by the rule-id
 * snapshot test and the catalog barrels.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeManifestJsonParseFailure } from "./manifest-json.js";
import {
  makeRecommendedPacksValidRule,
  makeStandaloneDeclarationValidRule,
  splitPackSpec,
} from "./recommended-packs-rules.js";

interface TestContext {
  readonly subject: { readonly manifestJson: unknown };
}

const options = {
  namespace: "skill",
  manifestFile: "skill.json",
  manifestJson: (context: TestContext) => context.subject.manifestJson,
};

const standaloneRule = makeStandaloneDeclarationValidRule<TestContext>(options);
const recommendedPacksRule = makeRecommendedPacksValidRule<TestContext>(options);

const context = (manifestJson: unknown): TestContext => ({ subject: { manifestJson } });

const base = {
  owner: "@acme",
  type: "skill",
  name: "brick-building",
  version: "1.0.0",
};

describe("splitPackSpec", () => {
  it("returns the whole spec when there is no version range", () => {
    expect(splitPackSpec("@acme/packs/bricks")).toEqual({
      fqn: "@acme/packs/bricks",
      range: undefined,
    });
  });

  it("splits on the @ that follows the last slash, not the owner @", () => {
    expect(splitPackSpec("@acme/packs/bricks@^1.0.0")).toEqual({
      fqn: "@acme/packs/bricks",
      range: "^1.0.0",
    });
  });
});

describe("<type>/standalone-declaration-valid", () => {
  it("ships as an advisory warning", () => {
    expect(standaloneRule.id).toBe("skill/standalone-declaration-valid");
    expect(standaloneRule.kind).toBe("advisory");
    expect(standaloneRule.severity).toBe("warning");
    expect(standaloneRule.description.length).toBeLessThanOrEqual(100);
  });

  it.effect("warns when standalone is false and recommendedPacks is absent", () =>
    Effect.gen(function* () {
      const findings = yield* standaloneRule.check(context({ ...base, standalone: false }));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe("skill/standalone-declaration-valid");
      expect(findings[0]?.severity).toBe("warning");
      expect(findings[0]?.location?.file).toBe("skill.json");
      // Both remediation paths are named: add a pack, or drop the flag.
      expect(findings[0]?.message).toContain("recommendedPacks");
      expect(findings[0]?.message).toContain("remove the `standalone` key");
    }),
  );

  it.effect("warns when standalone is false and recommendedPacks is empty", () =>
    Effect.gen(function* () {
      const findings = yield* standaloneRule.check(
        context({ ...base, standalone: false, recommendedPacks: [] }),
      );

      expect(findings).toHaveLength(1);
    }),
  );

  it.effect("stays silent when standalone is false and a pack is recommended", () =>
    Effect.gen(function* () {
      const findings = yield* standaloneRule.check(
        context({ ...base, standalone: false, recommendedPacks: ["@acme/packs/bricks"] }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("stays silent when standalone is absent or true", () =>
    Effect.gen(function* () {
      expect(yield* standaloneRule.check(context(base))).toEqual([]);
      expect(yield* standaloneRule.check(context({ ...base, standalone: true }))).toEqual([]);
      // Standalone extensions may still recommend packs.
      expect(
        yield* standaloneRule.check(
          context({ ...base, standalone: true, recommendedPacks: ["@acme/packs/bricks"] }),
        ),
      ).toEqual([]);
    }),
  );

  it.effect("stays silent for absent or unparseable manifests", () =>
    Effect.gen(function* () {
      expect(yield* standaloneRule.check(context(undefined))).toEqual([]);
      expect(
        yield* standaloneRule.check(context(makeManifestJsonParseFailure("skill.json"))),
      ).toEqual([]);
      expect(yield* standaloneRule.check(context("not an object"))).toEqual([]);
    }),
  );
});

describe("<type>/recommended-packs-valid", () => {
  it("ships as an advisory warning", () => {
    expect(recommendedPacksRule.id).toBe("skill/recommended-packs-valid");
    expect(recommendedPacksRule.kind).toBe("advisory");
    expect(recommendedPacksRule.severity).toBe("warning");
    expect(recommendedPacksRule.description.length).toBeLessThanOrEqual(100);
  });

  it.effect("stays silent for bare pack references", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRule.check(
        context({ ...base, recommendedPacks: ["@acme/packs/bricks", "@other/packs/mortar"] }),
      );

      expect(findings).toEqual([]);
    }),
  );

  it.effect("emits one finding per version-ranged entry", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRule.check(
        context({
          ...base,
          recommendedPacks: ["@acme/packs/bricks@^1.0.0", "@acme/packs/mortar@1.2.3"],
        }),
      );

      expect(findings).toHaveLength(2);
      expect(findings.every((f) => f.ruleId === "skill/recommended-packs-valid")).toBe(true);
      expect(findings.every((f) => f.severity === "warning")).toBe(true);
      expect(findings.every((f) => f.location?.file === "skill.json")).toBe(true);
      // The remediation names the bare FQN to replace the entry with.
      expect(findings[0]?.message).toContain("'@acme/packs/bricks'");
    }),
  );

  it.effect("reports only the offending entry when the list is mixed", () =>
    Effect.gen(function* () {
      const findings = yield* recommendedPacksRule.check(
        context({
          ...base,
          recommendedPacks: [
            "@acme/packs/bricks",
            "@acme/packs/mortar@^2.0.0",
            "@acme/packs/trowel",
          ],
        }),
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("@acme/packs/mortar@^2.0.0");
    }),
  );

  it.effect("stays silent for absent or unparseable manifests", () =>
    Effect.gen(function* () {
      expect(yield* recommendedPacksRule.check(context(undefined))).toEqual([]);
      expect(
        yield* recommendedPacksRule.check(context(makeManifestJsonParseFailure("skill.json"))),
      ).toEqual([]);
      expect(
        yield* recommendedPacksRule.check(context({ ...base, recommendedPacks: "no" })),
      ).toEqual([]);
    }),
  );
});
