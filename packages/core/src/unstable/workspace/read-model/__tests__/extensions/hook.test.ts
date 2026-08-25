/**
 * Hook subject module tests: declared/resolved/actual payload shapes and the
 * projections composed by the shared helper.
 *
 * Actual occurrences come exclusively from the canonical-extensions scanner
 * (`type === "hook"`). Agent-side managed hook groups and the advisory-rule
 * fallback region are renderings of an installed hook, never occurrences, so
 * this suite asserts against canonical input only.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedLockfile, decodedSettings } from "../../__fixtures__/decoders.js";
import { makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeHookExtensionsApi, type HookPackMember } from "../../extensions/hook.js";
import type { CanonicalExtensionOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";
import type { Lockfile } from "../../../../lockfile/schema.js";
import type { InstalledPackRef } from "../../types.js";
import { decodeExtensionNameSync } from "../../../../extensions/common.js";

const settingsWithHooks = (
  hooks: Record<string, string | { source: string; enabled: boolean }>,
): Effect.Effect<Settings, never> => decodedSettings({ hooks }).pipe(Effect.orDie);

const lockfileWithHooks = (names: ReadonlyArray<string>): Effect.Effect<Lockfile, never> =>
  decodedLockfile({
    lockfileVersion: 6,
    skills: {},
    hooks: Object.fromEntries(
      names.map((name) => [
        name,
        {
          type: "registry",
          sourceType: "registry",
          endpoint: "https://registry.agentxm.ai",
          extensionType: "hook",
          workspaceName: name,
          packageFormat: "agentxm",
          owner: "@acme",
          name,
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "agentxm",
          publisherBindingId: "hbnd_test",
          treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
        },
      ]),
    ),
  }).pipe(Effect.orDie);

const packRef: InstalledPackRef = {
  key: { scope: "project", type: "pack", name: "team-pack" },
};

const packMember = (name: string): HookPackMember => ({
  name: decodeExtensionNameSync(name),
  providingPack: packRef,
});

const harness = (params: {
  readonly settings?: Settings;
  readonly lockfile?: Lockfile;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly packMembers?: ReadonlyArray<HookPackMember>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    const api = yield* makeHookExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.fromUndefinedOr(params.lockfile)),
      },
      scanners: { canonical: Effect.succeed(params.canonicalOccurrences ?? []) },
      installedPacks: Effect.succeed(
        params.packMembers === undefined ? [] : [{ ref: packRef, hooks: params.packMembers }],
      ),
      diagnostics,
    });
    return { api, ref };
  });

const canonicalHook = (name: string): CanonicalExtensionOccurrence =>
  makeCanonicalOccurrence({
    scope: "project",
    type: "hook",
    origin: "canonical-axm",
    name,
    owner: "@acme",
    contentLocation: `/ws/.axm/extensions/@acme/hooks/${name}/src`,
  });

describe("makeHookExtensionsApi", () => {
  it.effect("declared and resolved are absent when settings and lockfile are absent", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({});
      expect(Option.isNone(yield* api.declared)).toBe(true);
      expect(Option.isNone(yield* api.resolved)).toBe(true);
    }),
  );

  it.effect("declared parses settings.hooks entries", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithHooks({
        "block-secrets": "@acme/hooks/block-secrets@^1.0.0",
      });
      const { api } = yield* harness({ settings });
      const declared = Option.getOrElse(yield* api.declared, () => []);
      expect(declared).toHaveLength(1);
      expect(declared[0]?.name).toBe("block-secrets");
      expect(declared[0]?.entry.source).toBe("@acme/hooks/block-secrets@^1.0.0");
    }),
  );

  it.effect("resolved parses lockfile.hooks entries", () =>
    Effect.gen(function* () {
      const lockfile = yield* lockfileWithHooks(["block-secrets"]);
      const settings = yield* settingsWithHooks({
        "block-secrets": "@acme/hooks/block-secrets@^1.0.0",
      });
      const { api } = yield* harness({ settings, lockfile });
      const resolved = Option.getOrElse(yield* api.resolved, () => []);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.lockEntry.type).toBe("registry");
    }),
  );

  it.effect("actual surfaces canonical hook occurrences and strips the src segment", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({ canonicalOccurrences: [canonicalHook("block-secrets")] });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(1);
      expect(actual[0]?.origin._tag).toBe("canonical-axm-hook");
      expect(actual[0]?.contentRoot).toBe("/ws/.axm/extensions/@acme/hooks/block-secrets/src");
      expect(actual[0]?.packageRoot).toBe("/ws/.axm/extensions/@acme/hooks/block-secrets");
    }),
  );

  it.effect("actual filters out non-hook canonical occurrences", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "skill",
            origin: "canonical-axm",
            name: "wrong",
            owner: "@acme",
            contentLocation: "/ws/.axm/extensions/@acme/skills/wrong/src",
          }),
        ],
      });
      expect(yield* api.actual).toHaveLength(0);
    }),
  );

  it.effect(
    "installed attaches actual occurrences and resolved lock entries to declared rows",
    () =>
      Effect.gen(function* () {
        const settings = yield* settingsWithHooks({
          "block-secrets": "@acme/hooks/block-secrets@^1.0.0",
        });
        const lockfile = yield* lockfileWithHooks(["block-secrets"]);
        const { api } = yield* harness({
          settings,
          lockfile,
          canonicalOccurrences: [canonicalHook("block-secrets")],
        });
        const installed = yield* api.installed;
        expect(installed).toHaveLength(1);
        expect(installed[0]?.installationOrigin._tag).toBe("direct");
        expect(installed[0]?.activation).toBe("enabled");
        expect(Option.isSome(installed[0]?.resolved ?? Option.none())).toBe(true);
        expect(installed[0]?.actual).toHaveLength(1);
        expect(yield* api.unmanaged).toHaveLength(0);
      }),
  );

  it.effect("a disabled declared hook is installed but not active", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithHooks({
        "block-secrets": { source: "@acme/hooks/block-secrets@^1.0.0", enabled: false },
      });
      const { api } = yield* harness({ settings });
      expect(yield* api.installed).toHaveLength(1);
      expect(yield* api.active).toHaveLength(0);
    }),
  );

  it.effect("pack members install implicitly and direct declarations win", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithHooks({
        "block-secrets": "@acme/hooks/block-secrets@^1.0.0",
      });
      const { api } = yield* harness({
        settings,
        packMembers: [packMember("block-secrets"), packMember("audit-log")],
      });
      const installed = yield* api.installed;
      expect(installed.map((row) => row.key.name)).toEqual(["audit-log", "block-secrets"]);
      const direct = installed.find((row) => row.key.name === "block-secrets");
      expect(direct?.installationOrigin._tag).toBe("direct");
      expect(direct?.providingPacks).toHaveLength(1);
      const implicit = installed.find((row) => row.key.name === "audit-log");
      expect(implicit?.installationOrigin._tag).toBe("pack-member");
    }),
  );

  it.effect("an undeclared canonical occurrence surfaces as unmanaged", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({ canonicalOccurrences: [canonicalHook("stray")] });
      const unmanaged = yield* api.unmanaged;
      expect(unmanaged).toHaveLength(1);
      expect(unmanaged[0]?.key.name).toBe("stray");
    }),
  );

  it.effect("an orphan lockfile entry publishes a diagnostic warning", () =>
    Effect.gen(function* () {
      const lockfile = yield* lockfileWithHooks(["ghost"]);
      const { api, ref } = yield* harness({ lockfile });
      yield* api.installed;
      const warnings = yield* Ref.get(ref);
      expect(warnings.some((w) => w.code === "orphan-resolved")).toBe(true);
    }),
  );
});
