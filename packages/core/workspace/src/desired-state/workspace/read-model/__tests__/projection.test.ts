/**
 * Shared projection helper tests.
 *
 * `projectInstalledExtensions(...)` composes installed/unmanaged from
 * declared/resolved/actual, and `projectPackMemberRows(...)` shapes the
 * Pack-supplied members the desired-state graph bound. The helpers own:
 *   - only acquiring declarations produce direct rows
 *   - direct-over-pack precedence
 *   - disabled-direct still claims actual occurrences
 *   - member activation comes from the binding, never from the read model
 *   - deterministic name-sorted ordering
 *
 * The helpers MUST NOT carry subject row shape or subject policy; both come in
 * as parameters. This test exercises them with placeholder declared /
 * resolved / actual / pack-member shapes that mirror what real subjects supply.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
import {
  projectInstalledExtensions,
  projectPackMemberRows,
  type PackMemberBinding,
  type SubjectPolicy,
} from "../extensions/projection.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions/common";
import type { InstalledPackRef } from "../types.js";

// ---------------------------------------------------------------------------
// Test domain — placeholder declared/resolved/actual/pack-member shapes
// ---------------------------------------------------------------------------

interface TestDeclaredEntry {
  readonly name: string;
  readonly source: string;
  readonly enabled: boolean;
}
type TestDeclared = ReadonlyArray<TestDeclaredEntry>;

interface TestResolvedEntry {
  readonly name: string;
  readonly source: string;
}
type TestResolved = ReadonlyArray<TestResolvedEntry>;

interface TestActualEntry {
  readonly name: string;
  readonly origin: string;
  readonly path: string;
}
type TestActual = ReadonlyArray<TestActualEntry>;

interface TestPackMember {
  readonly name: string;
  readonly pack: InstalledPackRef;
}

interface TestInstalledRow {
  readonly name: string;
  readonly installationOrigin:
    | { readonly _tag: "direct"; readonly declared: TestDeclaredEntry }
    | {
        readonly _tag: "pack-member";
        readonly member: TestPackMember;
        readonly pack: InstalledPackRef;
      };
  readonly activation: "enabled" | "disabled";
  readonly resolved: Option.Option<TestResolvedEntry>;
  readonly actual: ReadonlyArray<TestActualEntry>;
}

interface TestUnmanagedRow {
  readonly name: string;
  readonly actual: TestActualEntry;
}

const policy: SubjectPolicy<
  TestDeclared,
  TestResolved,
  TestActual,
  TestPackMember,
  TestInstalledRow,
  TestUnmanagedRow
> = {
  declaredEntries: (declared) => declared,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.enabled ? "enabled" : "disabled"),
  declaresAcquisition: () => true,
  resolvedEntries: (resolved) => resolved,
  resolvedName: (entry) => entry.name,
  actualEntries: (actual) => actual,
  actualName: (entry) => entry.name,
  packMember: ({ name, pack }) => ({ name, pack }),
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    name: input.name,
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
  }),
  buildUnmanagedRow: (entry) => ({ name: entry.name, actual: entry }),
};

interface HarnessInput {
  readonly declared: Effect.Effect<Option.Option<TestDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TestResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TestActual>;
}

const harness = (params: HarnessInput) => projectInstalledExtensions({ ...params, policy });

const memberHarness = (
  params: HarnessInput & { readonly bindings: ReadonlyArray<PackMemberBinding> },
) => projectPackMemberRows({ ...params, policy });

const DECLARED_ENABLED = (name: string): TestDeclaredEntry => ({
  name,
  source: `github:owner/${name}`,
  enabled: true,
});

const DECLARED_DISABLED = (name: string): TestDeclaredEntry => ({
  name,
  source: `github:owner/${name}`,
  enabled: false,
});

const RESOLVED = (name: string): TestResolvedEntry => ({
  name,
  source: `registry:owner/${name}@1.0.0`,
});

const ACTUAL = (name: string, origin = "claude-code"): TestActualEntry => ({
  name,
  origin,
  path: `/ws/.${origin}/${name}`,
});

const PACK_REF = (name: string): InstalledPackRef => ({
  key: { scope: "project", type: "pack", name: decodeExtensionNameSync(name) },
});

const BOUND = (name: string, pack: string, enabled = true): PackMemberBinding => ({
  name: decodeExtensionNameSync(name),
  pack: PACK_REF(pack),
  enabled,
});

describe("projectInstalledExtensions", () => {
  it.effect("direct-from-declared: included declared rows install", () =>
    Effect.gen(function* () {
      const out = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.name).toBe("alpha");
      expect(out.installed[0]?.installationOrigin._tag).toBe("direct");
      expect(out.installed[0]?.activation).toBe("enabled");
      expect(out.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("disabled-direct-still-claims-actual: actual entry attached, not unmanaged", () =>
    Effect.gen(function* () {
      const out = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_DISABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("alpha")]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.activation).toBe("disabled");
      expect(out.installed[0]?.actual).toHaveLength(1);
      expect(out.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("resolved-only entries never install", () =>
    Effect.gen(function* () {
      const out = yield* harness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.some([RESOLVED("orphan-tool")])),
        actual: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(0);
    }),
  );

  it.effect("deterministic ordering: installed sorted by name", () =>
    Effect.gen(function* () {
      const out = yield* harness({
        declared: Effect.succeed(
          Option.some([
            DECLARED_ENABLED("zeta"),
            DECLARED_ENABLED("alpha"),
            DECLARED_ENABLED("mu"),
          ]),
        ),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
      });
      expect(out.installed.map((r) => r.name)).toEqual(["alpha", "mu", "zeta"]);
    }),
  );

  it.effect("intermediate facts (actualOnly, claimed) not in public output", () =>
    Effect.gen(function* () {
      const out = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("alpha"), ACTUAL("legacy")]),
      });
      // Public surface exposes only installed and unmanaged rows.
      const keys = Object.keys(out).sort();
      expect(keys).toEqual(["installed", "unmanaged"]);
    }),
  );

  it.effect("actual-only stays unmanaged when not declared", () =>
    Effect.gen(function* () {
      const out = yield* harness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("legacy")]),
      });
      expect(out.unmanaged).toHaveLength(1);
      expect(out.unmanaged[0]?.name).toBe("legacy");
    }),
  );
});

describe("projectPackMemberRows", () => {
  it.effect("a bound member becomes a pack-member row carrying the bound activation", () =>
    Effect.gen(function* () {
      const rows = yield* memberHarness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.some([RESOLVED("review-tool")])),
        actual: Effect.succeed([ACTUAL("review-tool")]),
        bindings: [BOUND("review-tool", "team-pack", false)],
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.installationOrigin._tag).toBe("pack-member");
      expect(rows[0]?.activation).toBe("disabled");
      expect(Option.isSome(rows[0]?.resolved ?? Option.none())).toBe(true);
      expect(rows[0]?.actual).toHaveLength(1);
    }),
  );

  it.effect("direct-wins-over-pack-membership, even when the declaration is disabled", () =>
    Effect.gen(function* () {
      const rows = yield* memberHarness({
        declared: Effect.succeed(Option.some([DECLARED_DISABLED("review-tool")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        bindings: [BOUND("review-tool", "team-pack")],
      });
      expect(rows).toHaveLength(0);
    }),
  );

  it.effect("deterministic ordering: member rows sorted by name, one per member", () =>
    Effect.gen(function* () {
      const rows = yield* memberHarness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        bindings: [BOUND("zeta", "a-pack"), BOUND("alpha", "b-pack"), BOUND("zeta", "b-pack")],
      });
      expect(rows.map((r) => r.name)).toEqual(["alpha", "zeta"]);
    }),
  );
});
