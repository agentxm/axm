/**
 * Rule subject module tests.
 *
 * Rules have no settings/lockfile entry shape in v1, and no agent registers a
 * rule rendering directory. Actual occurrences come exclusively from the
 * canonical-extensions scanner (`type === "rule"`) plus any future agent-dir
 * occurrences declared at the scanner tier.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeRuleExtensionsApi } from "../../extensions/rule.js";
import type { CanonicalExtensionOccurrence } from "../../scanners/types.js";

const harness = (params: {
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly ignoredNames?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    return yield* makeRuleExtensionsApi({
      scope: "project",
      scanners: {
        canonical: Effect.succeed(params.canonicalOccurrences ?? []),
      },
      installedPacks: Effect.succeed([]),
      ignoredNames: new Set(params.ignoredNames ?? []),
      diagnostics,
    });
  });

describe("makeRuleExtensionsApi", () => {
  it.effect("declared and resolved are Option.none()", () =>
    Effect.gen(function* () {
      const api = yield* harness({});
      const declared = yield* api.declared;
      const resolved = yield* api.resolved;
      expect(Option.isNone(declared)).toBe(true);
      expect(Option.isNone(resolved)).toBe(true);
    }),
  );

  it.effect("actual surfaces canonical rule occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "rule",
            origin: "canonical-axm",
            name: "lint",
            owner: "@owner",
            contentLocation: "/ws/.axm/extensions/@owner/rules/src/lint",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(1);
      expect(actual[0]?.origin._tag).toBe("canonical-axm-rule");
    }),
  );

  it.effect("actual filters out non-rule canonical occurrences", () =>
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
});
