/**
 * Shared projection helper tests.
 *
 * `projectInstalledExtensions(...)` composes installed/active/unmanaged/ignored
 * from declared/resolved/actual plus the installed-pack set. The helper owns:
 *   - source-tolerance via `Effect.result` + `Effect.catchTags`
 *   - diagnostics publication for degraded sources and orphaned resolved entries
 *   - direct-over-pack precedence
 *   - disabled-direct still claims actual occurrences
 *   - ignored-suppression
 *   - deterministic name-sorted ordering
 *
 * The helper MUST NOT carry subject row shape or subject policy; both come in
 * as parameters. This test exercises the helper with placeholder declared /
 * resolved / actual / pack-member shapes that mirror what real subjects supply.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import {
  LockfileDecodeError,
  type LockfileReadError,
  SettingsDecodeError,
  type SettingsReadError,
} from "../errors.js";
import { projectInstalledExtensions, type SubjectPolicy } from "../extensions/projection.js";
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
  readonly version: string;
}

interface TestInstalledPack {
  readonly ref: InstalledPackRef;
  readonly members: ReadonlyArray<TestPackMember>;
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

interface TestIgnoredRow {
  readonly name: string;
  readonly reason: string;
}

const ignoredNames = (names: ReadonlyArray<string>) => new Set(names);

const policy: SubjectPolicy<
  TestDeclared,
  TestResolved,
  TestActual,
  TestPackMember,
  TestInstalledRow,
  TestUnmanagedRow,
  TestIgnoredRow
> = {
  declaredEntries: (declared) => declared,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.enabled ? "enabled" : "disabled"),
  resolvedEntries: (resolved) => resolved,
  resolvedName: (entry) => entry.name,
  actualEntries: (actual) => actual,
  actualName: (entry) => entry.name,
  packMemberName: (member) => member.name,
  isIgnoredName: (name, ignored) => ignored.has(name),
  packMemberActivation: () => "enabled",
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
  buildDeclaredIgnoredRow: (input) => ({ name: input.name, reason: "declared-ignored" }),
  buildPackMemberIgnoredRow: (input) => ({ name: input.name, reason: "pack-member-ignored" }),
  buildActualIgnoredRow: (input) => ({ name: input.name, reason: "actual-ignored" }),
  resolvedOrphanWarning: (name) => ({
    source: "lockfile",
    message: `orphan resolved: ${name}`,
    code: "orphan-resolved",
  }),
};

const subjectKey = "test-subject";

const harness = (params: {
  readonly declared: Effect.Effect<Option.Option<TestDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TestResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TestActual>;
  readonly installedPacks: Effect.Effect<ReadonlyArray<TestInstalledPack>>;
  readonly ignored?: Set<string>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    const out = yield* projectInstalledExtensions({
      subjectKey,
      declared: params.declared,
      resolved: params.resolved,
      actual: params.actual,
      installedPacks: params.installedPacks,
      packMembers: (pack) => pack.members,
      packRef: (pack) => pack.ref,
      ignoredNames: params.ignored ?? new Set<string>(),
      policy,
      diagnostics,
    });
    return { out, warnings: yield* Ref.get(ref) };
  });

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
  key: { scope: "project", type: "pack", name },
});

describe("projectInstalledExtensions", () => {
  it.effect("direct-from-declared: included declared rows install", () =>
    Effect.gen(function* () {
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.name).toBe("alpha");
      expect(out.installed[0]?.installationOrigin._tag).toBe("direct");
      expect(out.active).toHaveLength(1);
      expect(out.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("implicit-from-installed-pack-members", () =>
    Effect.gen(function* () {
      const packRef = PACK_REF("team-pack");
      const { out } = yield* harness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        installedPacks: Effect.succeed([
          { ref: packRef, members: [{ name: "review-tool", version: "1.0.0" }] },
        ]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.installationOrigin._tag).toBe("pack-member");
      expect(out.installed[0]?.activation).toBe("enabled");
    }),
  );

  it.effect("direct-wins-over-pack-membership", () =>
    Effect.gen(function* () {
      const packRef = PACK_REF("team-pack");
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("review-tool")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        installedPacks: Effect.succeed([
          { ref: packRef, members: [{ name: "review-tool", version: "1.0.0" }] },
        ]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.installationOrigin._tag).toBe("direct");
    }),
  );

  it.effect("direct-disabled-still-wins-over-pack-membership and excludes from active", () =>
    Effect.gen(function* () {
      const packRef = PACK_REF("team-pack");
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_DISABLED("review-tool")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("review-tool")]),
        installedPacks: Effect.succeed([
          { ref: packRef, members: [{ name: "review-tool", version: "1.0.0" }] },
        ]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.installationOrigin._tag).toBe("direct");
      expect(out.installed[0]?.activation).toBe("disabled");
      expect(out.active).toHaveLength(0);
      expect(out.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("disabled-direct-still-claims-actual: actual entry attached, not unmanaged", () =>
    Effect.gen(function* () {
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_DISABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("alpha")]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.actual).toHaveLength(1);
      expect(out.unmanaged).toHaveLength(0);
    }),
  );

  it.effect("ignored-suppressed-but-raw-visible", () =>
    Effect.gen(function* () {
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("alpha")]),
        installedPacks: Effect.succeed([]),
        ignored: ignoredNames(["alpha"]),
      });
      expect(out.installed).toHaveLength(0);
      expect(out.unmanaged).toHaveLength(0);
      expect(out.ignored).toHaveLength(2);
      const reasons = out.ignored.map((row) => row.reason).sort();
      expect(reasons).toContain("declared-ignored");
      expect(reasons).toContain("actual-ignored");
    }),
  );

  it.effect("orphaned-resolved-becomes-diagnostic but does not install", () =>
    Effect.gen(function* () {
      const { out, warnings } = yield* harness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.some([RESOLVED("orphan-tool")])),
        actual: Effect.succeed([]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(0);
      expect(warnings.some((w) => w.code === "orphan-resolved")).toBe(true);
    }),
  );

  it.effect("packs-not-installed-as-pack-members guard via empty pack set", () =>
    Effect.gen(function* () {
      // The pack subject passes installedPacks: Effect.succeed([]).
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("nested-pack")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.installationOrigin._tag).toBe("direct");
    }),
  );

  it.effect("source-tolerance: corrupt lockfile -> warning + projection still computes", () =>
    Effect.gen(function* () {
      const lockErr = new LockfileDecodeError({
        path: "/ws/axm-lock.yaml",
        issues: ["bad shape"],
        raw: {},
      });
      const { out, warnings } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("alpha")])),
        resolved: Effect.fail(lockErr),
        actual: Effect.succeed([ACTUAL("alpha")]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(1);
      expect(out.installed[0]?.actual).toHaveLength(1);
      expect(warnings.some((w) => w.source === "lockfile")).toBe(true);
    }),
  );

  it.effect("source-tolerance: corrupt settings -> warning + projection still computes", () =>
    Effect.gen(function* () {
      const settingsErr = new SettingsDecodeError({
        path: "/ws/.axm/settings.json",
        issues: ["bad shape"],
        raw: {},
      });
      const { out, warnings } = yield* harness({
        declared: Effect.fail(settingsErr),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("orphan", "claude-code")]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed).toHaveLength(0);
      expect(warnings.some((w) => w.source === "settings")).toBe(true);
      expect(out.unmanaged).toHaveLength(1);
    }),
  );

  it.effect("deterministic ordering: installed sorted by name", () =>
    Effect.gen(function* () {
      const { out } = yield* harness({
        declared: Effect.succeed(
          Option.some([
            DECLARED_ENABLED("zeta"),
            DECLARED_ENABLED("alpha"),
            DECLARED_ENABLED("mu"),
          ]),
        ),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.installed.map((r) => r.name)).toEqual(["alpha", "mu", "zeta"]);
    }),
  );

  it.effect("intermediate facts (actualOnly, claimed) not in public output", () =>
    Effect.gen(function* () {
      const { out } = yield* harness({
        declared: Effect.succeed(Option.some([DECLARED_ENABLED("alpha")])),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("alpha"), ACTUAL("legacy")]),
        installedPacks: Effect.succeed([]),
      });
      // Public surface: installed, active, unmanaged, ignored only.
      const keys = Object.keys(out).sort();
      expect(keys).toEqual(["active", "ignored", "installed", "unmanaged"]);
    }),
  );

  it.effect("actual-only stays unmanaged when not declared, not packed, not ignored", () =>
    Effect.gen(function* () {
      const { out } = yield* harness({
        declared: Effect.succeed(Option.none()),
        resolved: Effect.succeed(Option.none()),
        actual: Effect.succeed([ACTUAL("legacy")]),
        installedPacks: Effect.succeed([]),
      });
      expect(out.unmanaged).toHaveLength(1);
      expect(out.unmanaged[0]?.name).toBe("legacy");
    }),
  );
});
