/**
 * Pack subject module tests.
 *
 * Packs use a specialized installed projection: only direct installation
 * origins are produced — packs cannot be members of other packs. The pack
 * namespace passes an empty installed-pack set into the projection helper for
 * its own derivation.
 *
 * Pack membership comes from authored manifests; the accepted Pack lock row
 * carries only external resolution and manifest identity.
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
      diagnostics,
    });
    return { api, ref };
  });

const validPackLockfile = (packName: string): Effect.Effect<Lockfile, never> =>
  // Run the lockfile through the canonical decoder so branded fields
  // (HandleSchema, ExtensionNameSchema, VersionSchema,
  // ExtensionFqnSchema) carry the correct brands.
  decodedLockfile({
    lockfileVersion: 5,
    skills: {},
    packs: {
      [packName]: {
        type: "registry",
        owner: "@team",
        name: packName,
        resolvedVersion: "1.0.0",
        integrity: "sha256-abc",
        manifestContentIdentity: "sha256-manifest",
        sourceName: "registry",
        publisherBindingId: "hbnd_test",
        treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
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

  it.effect("resolved exposes accepted Pack provenance without member authority", () =>
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
      expect(arr[0]?.lockEntry).toMatchObject({
        resolvedVersion: "1.0.0",
        manifestContentIdentity: "sha256-manifest",
      });
      expect("resolvedSkills" in (arr[0]?.lockEntry ?? {})).toBe(false);
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
            contentLocation: "/ws/.axm/extensions/@team/packs/team-pack",
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
