/**
 * docs subject module tests.
 *
 * Docs have no settings entry shape and no lockfile entry shape in v1, so
 * declared and resolved are always `Option.none()`. Actual occurrences come
 * exclusively from the canonical-extensions scanner (`type === "docs"`); no
 * agent registers a docs rendering directory.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeDocsExtensionsApi } from "../../extensions/docs.js";
import type { CanonicalExtensionOccurrence } from "../../scanners/types.js";

const harness = (params: {
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly ignoredNames?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    return yield* makeDocsExtensionsApi({
      scope: "project",
      scanners: { canonical: Effect.succeed(params.canonicalOccurrences ?? []) },
      installedPacks: Effect.succeed([]),
      ignoredNames: new Set(params.ignoredNames ?? []),
      diagnostics,
    });
  });

describe("makeDocsExtensionsApi", () => {
  it.effect("declared and resolved are always Option.none()", () =>
    Effect.gen(function* () {
      const api = yield* harness({});
      const declared = yield* api.declared;
      const resolved = yield* api.resolved;
      expect(Option.isNone(declared)).toBe(true);
      expect(Option.isNone(resolved)).toBe(true);
    }),
  );

  it.effect("actual surfaces canonical file occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "docs",
            origin: "canonical-axm",
            name: "license",
            owner: "@owner",
            contentLocation: "/ws/.axm/extensions/@own/docs/src/license",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(1);
      expect(actual[0]?.origin._tag).toBe("canonical-axm-file");
    }),
  );

  it.effect("actual filters out non-file canonical occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "skill",
            origin: "canonical-axm",
            name: "wrong",
            owner: "@owner",
            contentLocation: "/ws/.axm/extensions/@owner/skills/src/wrong",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(0);
    }),
  );

  it.effect("unmanaged surfaces all actual occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "docs",
            origin: "external-axm",
            name: "readme",
            owner: null,
            contentLocation: "/ws/.axm/extensions/extern/docs/readme",
          }),
        ],
      });
      const unmanaged = yield* api.unmanaged;
      const installed = yield* api.installed;
      expect(installed).toHaveLength(0);
      expect(unmanaged).toHaveLength(1);
    }),
  );
});
