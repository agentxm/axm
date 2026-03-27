import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { AppError } from "../app-error/index.js";
import type { ExtensionType } from "../extensions/index.js";
import { at, expectDefined } from "../test-helpers.js";
import {
  classifyExtensions,
  isIgnoredName,
  type ClassifiedExtension,
  type ClassifierInput,
} from "./classifier.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = <A>(effect: Effect.Effect<A, AppError>) => Effect.runSync(effect);
const runFail = <A>(effect: Effect.Effect<A, AppError>) => Effect.runSync(Effect.flip(effect));

const byLifecycle = (rows: ReadonlyArray<ClassifiedExtension>, lc: string) =>
  rows.filter((r) => r.lifecycle === lc);

const names = (rows: ReadonlyArray<ClassifiedExtension>) => rows.map((r) => r.name);

const defaultMeta = { packagingKind: "native" as const, isBuiltIn: false };
const builtinMeta = { packagingKind: "native" as const, isBuiltIn: true };
const nonNativeMeta = { packagingKind: "non-native" as const, isBuiltIn: false };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifyExtensions", () => {
  describe("configured only", () => {
    it("yields configured + installed", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          alpha: { source: "registry:alpha", enabled: true },
          beta: { source: "registry:beta", enabled: false },
        },
        lockedNames: [],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          alpha: defaultMeta,
          beta: defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const configured = byLifecycle(result, "configured");
      const implicit = byLifecycle(result, "implicit");
      const unmanaged = byLifecycle(result, "unmanaged");

      expect(configured).toHaveLength(2);
      expect(implicit).toHaveLength(0);
      expect(unmanaged).toHaveLength(0);

      // Installed = configured U implicit
      const installed = [...configured, ...implicit];
      expect(installed).toHaveLength(2);
    });
  });

  describe("implicit only", () => {
    it("yields implicit + installed", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["gamma", "delta"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          gamma: defaultMeta,
          delta: defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const configured = byLifecycle(result, "configured");
      const implicit = byLifecycle(result, "implicit");
      const unmanaged = byLifecycle(result, "unmanaged");

      expect(configured).toHaveLength(0);
      expect(implicit).toHaveLength(2);
      expect(unmanaged).toHaveLength(0);

      // Installed = configured U implicit
      const installed = [...configured, ...implicit];
      expect(installed).toHaveLength(2);
    });

    it("requires native source metadata", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["gamma"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          gamma: defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const implicit = byLifecycle(result, "implicit");
      expect(implicit).toHaveLength(1);
      expect(at(implicit, 0).packagingKind).toBe("native");
    });
  });

  describe("non-native lockfile-only", () => {
    it("returns classifier failure WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["bad-entry"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          "bad-entry": nonNativeMeta,
        },
      };

      const error = runFail(classifyExtensions(input));
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY");
    });
  });

  describe("configured + implicit", () => {
    it("keeps sets disjoint and installed as union", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          alpha: { source: "registry:alpha" },
        },
        lockedNames: ["alpha", "beta"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          alpha: defaultMeta,
          beta: defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const configured = byLifecycle(result, "configured");
      const implicit = byLifecycle(result, "implicit");

      // alpha is configured, beta is implicit (locked but not configured)
      expect(names(configured)).toEqual(["alpha"]);
      expect(names(implicit)).toEqual(["beta"]);

      // Disjoint: C ∩ P = ∅
      const configuredSet = new Set(names(configured));
      const implicitSet = new Set(names(implicit));
      const intersection = Array.filter([...configuredSet], (n) => implicitSet.has(n));
      expect(intersection).toHaveLength(0);

      // Installed = C ∪ P
      const installed = [...configured, ...implicit];
      expect(installed).toHaveLength(2);
    });
  });

  describe("ignored exact match", () => {
    it("excludes names from implicit and unmanaged", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["ignored-skill", "kept-skill"],
        detectedNames: ["ignored-skill", "detected-only"],
        ignoredPatterns: ["ignored-skill"],
        sourceMetaByName: {
          "ignored-skill": defaultMeta,
          "kept-skill": defaultMeta,
          "detected-only": nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const allNames = names(result);

      expect(allNames).not.toContain("ignored-skill");
      expect(allNames).toContain("kept-skill");
      expect(allNames).toContain("detected-only");
    });
  });

  describe("ignored glob", () => {
    it("supports simple * with full-name anchoring", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["openspec-core", "openspec-utils"],
        detectedNames: ["core-openspec"],
        ignoredPatterns: ["openspec-*"],
        sourceMetaByName: {
          "openspec-core": defaultMeta,
          "openspec-utils": defaultMeta,
          "core-openspec": nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const allNames = names(result);

      // openspec-core and openspec-utils match "openspec-*" and are excluded
      expect(allNames).not.toContain("openspec-core");
      expect(allNames).not.toContain("openspec-utils");

      // core-openspec does not match "openspec-*"
      expect(allNames).toContain("core-openspec");
    });
  });

  describe("unmanaged derivation", () => {
    it("equals E \\ (C ∪ P) for skills", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          alpha: { source: "registry:alpha" },
        },
        lockedNames: ["alpha", "beta"],
        detectedNames: ["alpha", "beta", "gamma", "delta"],
        ignoredPatterns: [],
        sourceMetaByName: {
          alpha: defaultMeta,
          beta: defaultMeta,
          gamma: nonNativeMeta,
          delta: nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const configured = byLifecycle(result, "configured");
      const implicit = byLifecycle(result, "implicit");
      const unmanaged = byLifecycle(result, "unmanaged");

      // C = {alpha}, P = {beta}, U = {gamma, delta}
      expect(names(configured)).toEqual(["alpha"]);
      expect(names(implicit)).toEqual(["beta"]);
      expect(names(unmanaged)).toEqual(["delta", "gamma"]);

      // U = E \ (C ∪ P)
      const configuredAndImplicit = new Set([...names(configured), ...names(implicit)]);
      const allDetected = new Set(input.detectedNames);
      const expectedUnmanaged = [...allDetected]
        .filter((n) => !configuredAndImplicit.has(n))
        .sort();
      expect(names(unmanaged)).toEqual(expectedUnmanaged);
    });
  });

  describe("set invariants", () => {
    it("holds C ∩ P = ∅, U ∩ Installed = ∅, E = C ⊎ P ⊎ U", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          alpha: { source: "registry:alpha" },
          beta: { source: "registry:beta" },
        },
        lockedNames: ["alpha", "gamma", "delta"],
        detectedNames: ["alpha", "gamma", "epsilon"],
        ignoredPatterns: [],
        sourceMetaByName: {
          alpha: defaultMeta,
          beta: defaultMeta,
          gamma: defaultMeta,
          delta: defaultMeta,
          epsilon: nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const configured = byLifecycle(result, "configured");
      const implicit = byLifecycle(result, "implicit");
      const unmanaged = byLifecycle(result, "unmanaged");

      const cNames = new Set(names(configured));
      const pNames = new Set(names(implicit));
      const uNames = new Set(names(unmanaged));

      // C ∩ P = ∅
      expect(Array.filter([...cNames], (n) => pNames.has(n))).toHaveLength(0);

      // U ∩ Installed = ∅ (Installed = C ∪ P)
      const installed = new Set([...cNames, ...pNames]);
      expect(Array.filter([...uNames], (n) => installed.has(n))).toHaveLength(0);

      // E = C ⊎ P ⊎ U (disjoint union covers all)
      const allNames = new Set([...cNames, ...pNames, ...uNames]);
      expect(allNames.size).toBe(cNames.size + pNames.size + uNames.size);
      expect(result).toHaveLength(allNames.size);
    });
  });

  describe("phase behavior", () => {
    it.each(["command", "mcp-server", "pack"] satisfies ExtensionType[])(
      "%s returns empty unmanaged set",
      (type) => {
        const input: ClassifierInput = {
          type,
          configured: {
            alpha: { source: "registry:alpha" },
          },
          lockedNames: ["alpha", "beta"],
          detectedNames: [],
          ignoredPatterns: [],
          sourceMetaByName: {
            alpha: type === "pack" ? defaultMeta : defaultMeta,
            beta: type === "pack" ? defaultMeta : defaultMeta,
          },
        };

        const result = run(classifyExtensions(input));
        const unmanaged = byLifecycle(result, "unmanaged");
        expect(unmanaged).toHaveLength(0);
      },
    );
  });

  describe("extension type coverage", () => {
    const allTypes: ReadonlyArray<ExtensionType> = ["skill", "command", "mcp-server", "pack"];

    it.each([...allTypes])("exercises %s type", (type) => {
      const input: ClassifierInput = {
        type,
        configured: {
          alpha: { source: "registry:alpha" },
        },
        lockedNames: ["alpha", "beta"],
        detectedNames: type === "skill" ? ["gamma"] : [],
        ignoredPatterns: [],
        sourceMetaByName: {
          alpha: defaultMeta,
          beta: defaultMeta,
          gamma: nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      expect(result.length).toBeGreaterThan(0);

      // Every row has the expected type
      for (const row of result) {
        expect(row.type).toBe(type);
      }
    });
  });

  describe("deterministic output", () => {
    it("repeated classification yields stable output", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          zebra: { source: "registry:zebra" },
          alpha: { source: "registry:alpha" },
          mango: { source: "registry:mango" },
        },
        lockedNames: ["zebra", "alpha", "mango", "beta", "gamma"],
        detectedNames: ["delta", "epsilon"],
        ignoredPatterns: [],
        sourceMetaByName: {
          zebra: defaultMeta,
          alpha: defaultMeta,
          mango: defaultMeta,
          beta: defaultMeta,
          gamma: defaultMeta,
          delta: nonNativeMeta,
          epsilon: nonNativeMeta,
        },
      };

      const result1 = run(classifyExtensions(input));
      const result2 = run(classifyExtensions(input));
      const result3 = run(classifyExtensions(input));

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);

      // Verify name-sorted within each lifecycle bucket
      const configured = byLifecycle(result1, "configured");
      const implicit = byLifecycle(result1, "implicit");
      const unmanaged = byLifecycle(result1, "unmanaged");

      expect(names(configured)).toEqual([...names(configured)].sort());
      expect(names(implicit)).toEqual([...names(implicit)].sort());
      expect(names(unmanaged)).toEqual([...names(unmanaged)].sort());
    });
  });

  describe("source classification", () => {
    it("verifies packagingKind and isBuiltIn derivation", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          builtin: { source: "builtin:core" },
          native: { source: "registry:native" },
          external: { source: "github:org/repo" },
        },
        lockedNames: ["builtin", "native", "external"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          builtin: builtinMeta,
          native: defaultMeta,
          external: nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));

      const builtinRow = expectDefined(result.find((r) => r.name === "builtin"));
      expect(builtinRow.packagingKind).toBe("native");
      expect(builtinRow.isBuiltIn).toBe(true);

      const nativeRow = expectDefined(result.find((r) => r.name === "native"));
      expect(nativeRow.packagingKind).toBe("native");
      expect(nativeRow.isBuiltIn).toBe(false);

      const externalRow = expectDefined(result.find((r) => r.name === "external"));
      expect(externalRow.packagingKind).toBe("non-native");
      expect(externalRow.isBuiltIn).toBe(false);
    });

    it("isBuiltIn implies packagingKind = native", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          builtin: { source: "builtin:core" },
        },
        lockedNames: [],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          builtin: builtinMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const builtinRow = expectDefined(result.find((r) => r.name === "builtin"));
      expect(builtinRow.isBuiltIn).toBe(true);
      expect(builtinRow.packagingKind).toBe("native");
    });

    it("pack entries are always native", () => {
      const input: ClassifierInput = {
        type: "pack",
        configured: {
          "my-pack": { source: "registry:my-pack" },
        },
        lockedNames: ["my-pack", "implicit-pack"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          "my-pack": defaultMeta,
          "implicit-pack": defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      for (const row of result) {
        expect(row.packagingKind).toBe("native");
      }
    });

    it("derives External = E ∩ non-native", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          native: { source: "registry:native" },
          external: { source: "github:org/repo" },
        },
        lockedNames: [],
        detectedNames: ["local-skill"],
        ignoredPatterns: [],
        sourceMetaByName: {
          native: defaultMeta,
          external: nonNativeMeta,
          "local-skill": nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const externalRows = result.filter((r) => r.packagingKind === "non-native");
      expect(externalRows.map((r) => r.name).sort()).toEqual(["external", "local-skill"]);
    });
  });

  describe("configured-vs-ignored conflict", () => {
    it("is validated upstream (not in classifier)", () => {
      // The classifier itself does not validate configured-vs-ignored conflicts;
      // that is handled by validateIgnoredConfigConflicts in settings.
      // The classifier simply classifies what it receives.
      // This test documents that configured entries pass through even if
      // they match ignored patterns (the conflict should be caught earlier).
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          "openspec-core": { source: "registry:openspec-core" },
        },
        lockedNames: [],
        detectedNames: [],
        ignoredPatterns: ["openspec-*"],
        sourceMetaByName: {
          "openspec-core": defaultMeta,
        },
      };

      // Configured entries are not excluded by ignored patterns
      const result = run(classifyExtensions(input));
      expect(names(result)).toContain("openspec-core");
    });
  });

  // -------------------------------------------------------------------------
  // Regression tests
  // -------------------------------------------------------------------------

  describe("regression: ignored exclusions", () => {
    it("openspec-* excludes from both implicit and unmanaged sets", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          "keep-me": { source: "registry:keep-me" },
        },
        lockedNames: ["keep-me", "openspec-core", "openspec-utils"],
        detectedNames: ["openspec-tools", "other-skill"],
        ignoredPatterns: ["openspec-*"],
        sourceMetaByName: {
          "keep-me": defaultMeta,
          "openspec-core": defaultMeta,
          "openspec-utils": defaultMeta,
          "openspec-tools": nonNativeMeta,
          "other-skill": nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const allNames = names(result);

      // openspec-* entries excluded from implicit and unmanaged
      expect(allNames).not.toContain("openspec-core");
      expect(allNames).not.toContain("openspec-utils");
      expect(allNames).not.toContain("openspec-tools");

      // Non-ignored entries retained
      expect(allNames).toContain("keep-me");
      expect(allNames).toContain("other-skill");

      // Verify lifecycle correctness
      expect(byLifecycle(result, "configured").map((r) => r.name)).toEqual(["keep-me"]);
      expect(byLifecycle(result, "unmanaged").map((r) => r.name)).toEqual(["other-skill"]);
    });

    it("multiple ignored patterns combine correctly", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["openspec-core", "test-skill", "debug-util"],
        detectedNames: ["openspec-tools", "test-runner", "debug-log"],
        ignoredPatterns: ["openspec-*", "test-*"],
        sourceMetaByName: {
          "openspec-core": defaultMeta,
          "test-skill": defaultMeta,
          "debug-util": defaultMeta,
          "openspec-tools": nonNativeMeta,
          "test-runner": nonNativeMeta,
          "debug-log": nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const allNames = names(result);

      // Both patterns exclude their matches
      expect(allNames).not.toContain("openspec-core");
      expect(allNames).not.toContain("openspec-tools");
      expect(allNames).not.toContain("test-skill");
      expect(allNames).not.toContain("test-runner");

      // Non-matching entries retained
      expect(allNames).toContain("debug-util");
      expect(allNames).toContain("debug-log");
    });
  });

  describe("regression: non-native lockfile-only classifier failure", () => {
    it("fails with mixed native and non-native lockfile-only entries", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["native-skill", "non-native-skill"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          "native-skill": defaultMeta,
          "non-native-skill": nonNativeMeta,
        },
      };

      const error = runFail(classifyExtensions(input));
      expect(error.code).toBe("WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY");
      expect(error.details).toContain("non-native-skill");
    });

    it("does not fail when non-native lockfile-only entries are ignored", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {},
        lockedNames: ["non-native-skill"],
        detectedNames: [],
        ignoredPatterns: ["non-native-*"],
        sourceMetaByName: {
          "non-native-skill": nonNativeMeta,
        },
      };

      // Should succeed because the non-native entry is ignored
      const result = run(classifyExtensions(input));
      expect(result).toHaveLength(0);
    });

    it("does not fail when non-native lockfile entry is configured", () => {
      const input: ClassifierInput = {
        type: "skill",
        configured: {
          "non-native-skill": { source: "github:org/repo" },
        },
        lockedNames: ["non-native-skill"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          "non-native-skill": nonNativeMeta,
        },
      };

      const result = run(classifyExtensions(input));
      expect(result).toHaveLength(1);
      expect(at(result, 0).lifecycle).toBe("configured");
    });
  });

  describe("regression: pack native-only invariant", () => {
    it("all pack rows have packagingKind native for configured and implicit", () => {
      const input: ClassifierInput = {
        type: "pack",
        configured: {
          "configured-pack": { source: "registry:configured-pack" },
        },
        lockedNames: ["configured-pack", "implicit-pack-a", "implicit-pack-b"],
        detectedNames: [],
        ignoredPatterns: [],
        sourceMetaByName: {
          "configured-pack": defaultMeta,
          "implicit-pack-a": defaultMeta,
          "implicit-pack-b": defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      expect(result.length).toBeGreaterThan(0);

      for (const row of result) {
        expect(row.packagingKind).toBe("native");
      }

      // Verify both configured and implicit rows present
      expect(byLifecycle(result, "configured")).toHaveLength(1);
      expect(byLifecycle(result, "implicit")).toHaveLength(2);
    });

    it("pack default source meta falls back to native packagingKind", () => {
      const input: ClassifierInput = {
        type: "pack",
        configured: {
          "my-pack": { source: "registry:my-pack" },
        },
        lockedNames: ["my-pack", "no-meta-pack"],
        detectedNames: [],
        ignoredPatterns: [],
        // Intentionally no sourceMetaByName for no-meta-pack
        sourceMetaByName: {
          "my-pack": defaultMeta,
        },
      };

      const result = run(classifyExtensions(input));
      const noMetaPack = expectDefined(result.find((r) => r.name === "no-meta-pack"));
      expect(noMetaPack.packagingKind).toBe("native");
    });
  });
});

describe("isIgnoredName", () => {
  it("matches exact name", () => {
    expect(isIgnoredName(["my-skill"], "my-skill")).toBe(true);
  });

  it("matches glob pattern", () => {
    expect(isIgnoredName(["openspec-*"], "openspec-core")).toBe(true);
  });

  it("does not match non-matching name", () => {
    expect(isIgnoredName(["openspec-*"], "core-openspec")).toBe(false);
  });

  it("matches * wildcard for any name", () => {
    expect(isIgnoredName(["*"], "anything")).toBe(true);
  });

  it("returns false for empty patterns", () => {
    expect(isIgnoredName([], "anything")).toBe(false);
  });
});
