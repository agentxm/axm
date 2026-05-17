/**
 * Pack subject module tests.
 *
 * Packs use a specialized installed projection: only direct installation
 * origins are produced — packs cannot be members of other packs. The pack
 * namespace passes an empty installed-pack set into the projection helper for
 * its own derivation.
 *
 * Resolved member groups (`resolvedSkills`, `resolvedCommands`, etc.) read
 * directly from the installed pack lockfile entry's `resolvedSkills` /
 * `resolvedCommands` / `resolvedMcpServers` / `resolvedSubagents` maps.
 * Phase 7's pack module exposes these on the resolved payload; Phase 9 then
 * threads them into other subjects' `installedPacks` inputs.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedLockfile, decodedSettings } from "../../__fixtures__/decoders.js";
import { makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makePackExtensionsApi } from "../../extensions/pack.js";
import type { CanonicalExtensionOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";
import type { Lockfile } from "../../../../lockfile/schema.js";

const settingsWithPacks = (
  packs: Record<string, { source: string }>,
): Effect.Effect<Settings, never> => decodedSettings({ packs }).pipe(Effect.orDie);

const harness = (params: {
  readonly settings?: Settings;
  readonly lockfile?: Lockfile;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly ignoredNames?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    const api = yield* makePackExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.fromUndefinedOr(params.lockfile)),
      },
      scanners: { canonical: Effect.succeed(params.canonicalOccurrences ?? []) },
      ignoredPatterns: new Set(params.ignoredNames ?? []),
      diagnostics,
    });
    return { api, ref };
  });

const validPackLockfile = (packName: string): Effect.Effect<Lockfile, never> =>
  // Run the lockfile through the canonical decoder so branded fields
  // (HandleSchema, ExtensionNameSchema, VersionSchema,
  // ExtensionFqnSchema) carry the correct brands.
  decodedLockfile({
    lockfileVersion: 1,
    skills: {},
    packs: {
      [packName]: {
        type: "registry",
        owner: "@team",
        name: packName,
        resolvedVersion: "1.0.0",
        integrity: "sha256-abc",
        sourceName: "registry",
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        resolvedSkills: { "@team/skills/review-tool": "1.0.0" },
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
      },
    },
  }).pipe(Effect.orDie);

describe("makePackExtensionsApi", () => {
  it.effect("declared parses packs from settings", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithPacks({
        "team-pack": { source: "registry:@team/team-pack" },
      });
      const { api } = yield* harness({ settings });
      const declared = yield* api.declared;
      const arr = Option.match(declared, { onNone: () => [], onSome: (d) => d });
      expect(arr).toHaveLength(1);
      expect(arr[0]?.name).toBe("team-pack");
    }),
  );

  it.effect("resolved exposes pack lockfile entry with member groups", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithPacks({
        "team-pack": { source: "registry:@team/team-pack" },
      });
      const lockfile = yield* validPackLockfile("team-pack");
      const { api } = yield* harness({ settings, lockfile });
      const resolved = yield* api.resolved;
      const arr = Option.match(resolved, { onNone: () => [], onSome: (r) => r });
      expect(arr).toHaveLength(1);
      expect(arr[0]?.name).toBe("team-pack");
      // resolved member group keys (FQN) preserved verbatim.
      expect(Object.keys(arr[0]?.lockEntry.resolvedSkills ?? {})).toContain(
        "@team/skills/review-tool",
      );
    }),
  );

  it.effect("installed produces direct rows only (packs are not pack members)", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithPacks({
        "team-pack": { source: "registry:@team/team-pack" },
      });
      const lockfile = yield* validPackLockfile("team-pack");
      const { api } = yield* harness({ settings, lockfile });
      const installed = yield* api.installed;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.installationOrigin._tag).toBe("direct");
      expect(installed[0]?.activation).toBe("enabled");
    }),
  );

  it.effect("actual-only canonical pack does not install (no settings declaration)", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "pack",
            origin: "canonical-axm",
            name: "team-pack",
            owner: "@team",
            contentLocation: "/ws/.axm/extensions/@team/packs/src/team-pack",
          }),
        ],
      });
      const installed = yield* api.installed;
      const unmanaged = yield* api.unmanaged;
      expect(installed).toHaveLength(0);
      expect(unmanaged).toHaveLength(1);
    }),
  );
});
