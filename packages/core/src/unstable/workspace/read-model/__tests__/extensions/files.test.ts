/**
 * files subject module tests: declared/resolved/actual payload shapes and the
 * projections composed by the shared helper.
 *
 * Declared packages come from `settings.files`, resolved packages from
 * `axm-lock.yaml` `files`, and actual occurrences exclusively from the
 * canonical-extensions scanner (`type === "files"`); no agent registers a files
 * rendering directory.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedLockfile, decodedSettings } from "../../__fixtures__/decoders.js";
import { makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeFilesExtensionsApi, type FilesPackMember } from "../../extensions/files.js";
import type { CanonicalExtensionOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";
import type { Lockfile } from "../../../../lockfile/schema.js";
import type { InstalledPackRef } from "../../types.js";
import { decodeExtensionNameSync } from "../../../../extensions/common.js";

const settingsWithFiles = (
  files: Record<string, string | { source: string; enabled: boolean }>,
): Effect.Effect<Settings, never> => decodedSettings({ files }).pipe(Effect.orDie);

const lockfileWithFiles = (names: ReadonlyArray<string>): Effect.Effect<Lockfile, never> =>
  decodedLockfile({
    lockfileVersion: 3,
    skills: {},
    files: Object.fromEntries(
      names.map((name) => [
        name,
        {
          type: "registry",
          owner: "@acme",
          name,
          resolvedVersion: "1.0.0",
          integrity: "sha512-abc",
          sourceName: "registry",
          publisherBindingId: "hbnd_test",
          installedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    ),
  }).pipe(Effect.orDie);

const packRef: InstalledPackRef = {
  key: { scope: "project", type: "pack", name: "team-pack" },
};

const packMember = (name: string): FilesPackMember => ({
  name: decodeExtensionNameSync(name),
  providingPack: packRef,
});

const harness = (params: {
  readonly settings?: Settings;
  readonly lockfile?: Lockfile;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly packMembers?: ReadonlyArray<FilesPackMember>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    const api = yield* makeFilesExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.fromUndefinedOr(params.lockfile)),
      },
      scanners: { canonical: Effect.succeed(params.canonicalOccurrences ?? []) },
      installedPacks: Effect.succeed(
        params.packMembers === undefined ? [] : [{ ref: packRef, files: params.packMembers }],
      ),
      diagnostics,
    });
    return { api, ref };
  });

const canonicalFiles = (name: string): CanonicalExtensionOccurrence =>
  makeCanonicalOccurrence({
    scope: "project",
    type: "files",
    origin: "canonical-axm",
    name,
    owner: "@acme",
    contentLocation: `/ws/.axm/extensions/@acme/files/${name}/src`,
  });

describe("makeFilesExtensionsApi", () => {
  it.effect("declared and resolved are absent when settings and lockfile are absent", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({});
      expect(Option.isNone(yield* api.declared)).toBe(true);
      expect(Option.isNone(yield* api.resolved)).toBe(true);
    }),
  );

  it.effect("declared parses settings.files entries", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithFiles({
        baseline: "@acme/files/baseline@^1.0.0",
      });
      const { api } = yield* harness({ settings });
      const declared = Option.getOrElse(yield* api.declared, () => []);
      expect(declared).toHaveLength(1);
      expect(declared[0]?.name).toBe("baseline");
      expect(declared[0]?.entry.source).toBe("@acme/files/baseline@^1.0.0");
      const byName = yield* api.declaredByName("baseline");
      expect(Option.isSome(byName)).toBe(true);
    }),
  );

  it.effect("resolved parses lockfile.files entries", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithFiles({ baseline: "@acme/files/baseline@^1.0.0" });
      const lockfile = yield* lockfileWithFiles(["baseline"]);
      const { api } = yield* harness({ settings, lockfile });
      const resolved = Option.getOrElse(yield* api.resolved, () => []);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]?.lockEntry.type).toBe("registry");
    }),
  );

  it.effect("actual surfaces canonical file occurrences", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({ canonicalOccurrences: [canonicalFiles("baseline")] });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(1);
      expect(actual[0]?.origin._tag).toBe("canonical-axm-file");
      expect(actual[0]?.packageRoot).toBe("/ws/.axm/extensions/@acme/files/baseline");
    }),
  );

  it.effect("actual filters out non-file canonical occurrences", () =>
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

  it.effect("installed attaches actual occurrences and resolved lock entries", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithFiles({ baseline: "@acme/files/baseline@^1.0.0" });
      const lockfile = yield* lockfileWithFiles(["baseline"]);
      const { api } = yield* harness({
        settings,
        lockfile,
        canonicalOccurrences: [canonicalFiles("baseline")],
      });
      const installed = yield* api.installed;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.installationOrigin._tag).toBe("direct");
      expect(installed[0]?.actual).toHaveLength(1);
      expect(Option.isSome(installed[0]?.resolved ?? Option.none())).toBe(true);
      expect(yield* api.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("a disabled declared package is installed but not active", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithFiles({
        baseline: { source: "@acme/files/baseline@^1.0.0", enabled: false },
      });
      const { api } = yield* harness({ settings });
      expect(yield* api.installed).toHaveLength(1);
      expect(yield* api.active).toHaveLength(0);
    }),
  );

  it.effect("pack members install implicitly and direct declarations win", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithFiles({ baseline: "@acme/files/baseline@^1.0.0" });
      const { api } = yield* harness({
        settings,
        packMembers: [packMember("baseline"), packMember("house-style")],
      });
      const installed = yield* api.installed;
      expect(installed.map((row) => row.key.name)).toEqual(["baseline", "house-style"]);
      expect(installed.find((row) => row.key.name === "baseline")?.installationOrigin._tag).toBe(
        "direct",
      );
      expect(installed.find((row) => row.key.name === "house-style")?.installationOrigin._tag).toBe(
        "pack-member",
      );
    }),
  );

  it.effect("unmanaged surfaces undeclared actual occurrences", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "files",
            origin: "external-axm",
            name: "readme",
            owner: null,
            contentLocation: "/ws/.axm/extensions/external/files/readme",
          }),
        ],
      });
      expect(yield* api.installed).toHaveLength(0);
      expect(yield* api.unmanaged).toHaveLength(1);
    }),
  );

  it.effect("an orphan lockfile entry publishes a diagnostic warning", () =>
    Effect.gen(function* () {
      const lockfile = yield* lockfileWithFiles(["ghost"]);
      const { api, ref } = yield* harness({ lockfile });
      yield* api.installed;
      const warnings = yield* Ref.get(ref);
      expect(warnings.some((w) => w.code === "orphan-resolved")).toBe(true);
    }),
  );
});
