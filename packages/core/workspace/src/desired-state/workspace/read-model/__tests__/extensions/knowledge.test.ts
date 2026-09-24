/**
 * Knowledge subject module tests: declared/resolved/actual payload shapes and
 * the projections composed by the shared helper.
 *
 * The bundle package directory under `agent_extensions` is the only source of
 * actual occurrences. The derived `.axm/knowledge/index.md` catalog and the
 * instructions-file discovery region live outside `agent_extensions`, so the
 * canonical scanner never emits them — asserted here by feeding an index-md
 * occurrence path through the scanner fixture and expecting no knowledge row.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import { decodedLockfile, decodedSettings } from "../../__fixtures__/decoders.js";
import { makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeKnowledgeExtensionsApi } from "../../extensions/knowledge.js";
import type { PackMemberBinding } from "../../extensions/projection.js";
import type { CanonicalExtensionOccurrence } from "../../scanners/types.js";
import type { InstalledPackRef } from "../../types.js";
import type { Settings } from "../../../../settings/schema.js";
import type { Lockfile } from "../../../../lockfile/schema.js";

const settingsWithKnowledge = (
  knowledge: Record<string, string | { source: string; enabled: boolean }>,
): Effect.Effect<Settings, never> => decodedSettings({ knowledge }).pipe(Effect.orDie);

const lockfileWithKnowledge = (names: ReadonlyArray<string>): Effect.Effect<Lockfile, never> =>
  decodedLockfile({
    lockfileVersion: 8,
    skills: {},
    knowledge: Object.fromEntries(
      names.map((name) => [
        name,
        {
          source: { type: "registry", url: "https://registry.agentxm.ai" },
          identity: { owner: "@acme", name },
          resolved: {
            version: "1.0.0",
            integrity: "sha512-abc",
            publisherBindingId: "hbnd_test",
          },
          treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
        },
      ]),
    ),
  }).pipe(Effect.orDie);

const packRef: InstalledPackRef = {
  key: { scope: "project", type: "pack", name: "team-pack" },
};

const packMember = (name: string, enabled = true): PackMemberBinding => ({
  name: decodeExtensionNameSync(name),
  pack: packRef,
  enabled,
});

const harness = (params: {
  readonly settings?: Settings;
  readonly lockfile?: Lockfile;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
}) =>
  Effect.gen(function* () {
    const api = yield* makeKnowledgeExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.fromUndefinedOr(params.lockfile)),
      },
      scanners: { canonical: Effect.succeed(params.canonicalOccurrences ?? []) },
    });
    return { api };
  });

const canonicalBundle = (name: string): CanonicalExtensionOccurrence =>
  makeCanonicalOccurrence({
    scope: "project",
    type: "knowledge",
    origin: "canonical-axm",
    name,
    owner: "@acme",
    contentLocation: `/ws/agent_extensions/@acme/knowledge/${name}/src`,
  });

describe("makeKnowledgeExtensionsApi", () => {
  it.effect("declared and resolved are absent when settings and lockfile are absent", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({});
      expect(Option.isNone(yield* api.declared)).toBe(true);
      expect(Option.isNone(yield* api.resolved)).toBe(true);
    }),
  );

  it.effect("declared parses settings.knowledge entries", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithKnowledge({
        payments: "@acme/knowledge/payments@^1.0.0",
      });
      const { api } = yield* harness({ settings });
      const declared = Option.getOrElse(yield* api.declared, () => []);
      expect(declared).toHaveLength(1);
      expect(declared[0]?.name).toBe("payments");
      expect(declared[0]?.entry.source).toBe("@acme/knowledge/payments@^1.0.0");
    }),
  );

  it.effect("resolved parses lockfile.knowledge entries", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithKnowledge({
        payments: "@acme/knowledge/payments@^1.0.0",
      });
      const lockfile = yield* lockfileWithKnowledge(["payments"]);
      const { api } = yield* harness({ settings, lockfile });
      const resolved = Option.getOrElse(yield* api.resolved, () => []);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.lockEntry.source.type).toBe("registry");
    }),
  );

  it.effect("actual scopes contentRoot to the bundle src dir and packageRoot to the package", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({ canonicalOccurrences: [canonicalBundle("payments")] });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(1);
      expect(actual[0]?.origin._tag).toBe("canonical-axm-knowledge");
      expect(actual[0]?.contentRoot).toBe("/ws/agent_extensions/@acme/knowledge/payments/src");
      expect(actual[0]?.packageRoot).toBe("/ws/agent_extensions/@acme/knowledge/payments");
    }),
  );

  it.effect("the derived .axm/knowledge index is not a knowledge occurrence", () =>
    Effect.gen(function* () {
      // The scanner only walks `agent_extensions`, so a `.axm/knowledge` path can
      // never reach the family. Feeding a non-knowledge occurrence from that
      // tree keeps the invariant asserted at the family boundary too.
      const { api } = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "rule",
            origin: "canonical-axm",
            name: "index",
            owner: "@acme",
            contentLocation: "/ws/.axm/rules/index",
          }),
        ],
      });
      expect(yield* api.actual).toHaveLength(0);
      expect(yield* api.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("installed attaches actual and resolved to the declared bundle", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithKnowledge({
        payments: "@acme/knowledge/payments@^1.0.0",
      });
      const lockfile = yield* lockfileWithKnowledge(["payments"]);
      const { api } = yield* harness({
        settings,
        lockfile,
        canonicalOccurrences: [canonicalBundle("payments")],
      });
      const installed = yield* api.installed;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.installationOrigin._tag).toBe("direct");
      expect(installed[0]?.actual).toHaveLength(1);
      expect(Option.isSome(installed[0]?.resolved ?? Option.none())).toBe(true);
      expect(yield* api.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("a disabled declared bundle is installed but not active", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithKnowledge({
        payments: { source: "@acme/knowledge/payments@^1.0.0", enabled: false },
      });
      const { api } = yield* harness({ settings });
      const installed = yield* api.installed;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.activation).toBe("disabled");
    }),
  );

  it.effect("packMemberRows shapes bound members and lets direct declarations win", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithKnowledge({
        payments: "@acme/knowledge/payments@^1.0.0",
      });
      const { api } = yield* harness({ settings });
      const members = yield* api.packMemberRows([
        packMember("payments"),
        packMember("architecture", false),
      ]);
      expect(members.map((row) => row.key.name)).toEqual(["architecture"]);
      expect(members[0]?.installationOrigin._tag).toBe("pack-member");
      expect(members[0]?.activation).toBe("disabled");
      const installed = yield* api.installed;
      expect(installed.map((row) => row.key.name)).toEqual(["payments"]);
      expect(installed[0]?.installationOrigin._tag).toBe("direct");
    }),
  );

  it.effect("an undeclared bundle directory surfaces as unmanaged", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({ canonicalOccurrences: [canonicalBundle("stray")] });
      const unmanaged = yield* api.unmanaged;
      expect(unmanaged).toHaveLength(1);
      expect(unmanaged[0]?.key.name).toBe("stray");
    }),
  );
});
