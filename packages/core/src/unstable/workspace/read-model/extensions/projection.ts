/**
 * Shared projection helper: composes installed/active/unmanaged/ignored from
 * declared/resolved/actual plus the installed-pack set.
 *
 * Per the projection invariant in the workspace read-model design (Decision 7):
 *
 * ```ts
 * direct = declared.filter(notIgnored).map(withInstallationOrigin("direct"));
 * implicit = installedPacks
 *   .flatMap(p => p.members)
 *   .filter(notIgnored)
 *   .filter(notDeclaredByName) // direct (incl. disabled) wins
 *   .map(withInstallationOrigin("pack-member"));
 * installed = direct + implicit;
 * active = installed.filter(activation === "enabled");
 * unmanaged = actual
 *   .filter(notIgnored)
 *   .filter(notClaimedByInstalled)
 *   .filter(notClaimedBySubjectPolicy);
 * ignored = ignoredFrom(declared, packMembers, actual);
 * ```
 *
 * The helper owns:
 * - source-tolerance via `Effect.catch` so corrupt declared/resolved sources
 *   degrade through `diagnostics` rather than failing the projection;
 * - direct-over-pack precedence;
 * - disabled-direct still claims actual occurrences (excluded from active and
 *   from unmanaged);
 * - actual-occurrence attachment via `policy.attachActualToInstalled`;
 * - ignored suppression for declared, pack-member, and actual candidates;
 * - orphaned-resolved diagnostics — resolved entries with no direct or
 *   pack-member home publish a warning;
 * - deterministic name-sorted ordering.
 *
 * The helper does NOT own subject row shape or subject policy. Both come in as
 * parameters via `SubjectPolicy<...>`.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Diagnostics, Warning } from "../diagnostics.js";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
import type { ActivationState, InstallationOrigin, InstalledPackRef } from "../types.js";
import { findByName, type RowWithKey } from "./indexByName.js";

// ---------------------------------------------------------------------------
// Per-subject opaque entry aliases
// ---------------------------------------------------------------------------

/**
 * One entry within a subject's `declared` payload. The shape is opaque to the
 * helper; the policy callbacks bridge to subject internals.
 */
export type TDeclaredEntry<TDeclared> = TDeclared extends ReadonlyArray<infer E> ? E : TDeclared;

/** One entry within a subject's `resolved` payload. */
export type TResolvedEntry<TResolved> = TResolved extends ReadonlyArray<infer E> ? E : TResolved;

/** One actual occurrence within a subject's `actual` payload. */
export type TActualEntry<TActual> = TActual extends ReadonlyArray<infer E> ? E : TActual;

// ---------------------------------------------------------------------------
// Subject policy contract
// ---------------------------------------------------------------------------

/**
 * Subject-specific policy callbacks the projection helper requires.
 */
export interface SubjectPolicy<
  TDeclared,
  TResolved,
  TActual,
  TPackMember,
  TInstalled,
  TUnmanaged,
  TIgnored,
> {
  /** Iterate the subject's declared entries from a decoded `declared` payload. */
  readonly declaredEntries: (declared: TDeclared) => ReadonlyArray<TDeclaredEntry<TDeclared>>;

  /** Extract the subject name from a declared entry. */
  readonly declaredName: (entry: TDeclaredEntry<TDeclared>) => string;

  /**
   * Activation state derived from a declared entry. For subjects without an
   * `enabled` flag (mcp-server, pack), return `"enabled"` unconditionally.
   */
  readonly declaredActivation: (entry: TDeclaredEntry<TDeclared>) => ActivationState;

  /** Iterate the subject's resolved entries from a decoded `resolved` payload. */
  readonly resolvedEntries: (resolved: TResolved) => ReadonlyArray<TResolvedEntry<TResolved>>;

  /** Extract the subject name from a resolved entry. */
  readonly resolvedName: (entry: TResolvedEntry<TResolved>) => string;

  /** Iterate the subject's actual occurrences from an `actual` payload. */
  readonly actualEntries: (actual: TActual) => ReadonlyArray<TActualEntry<TActual>>;

  /** Extract the subject name from an actual occurrence. */
  readonly actualName: (entry: TActualEntry<TActual>) => string;

  /** Extract the subject name from a pack-member entry. */
  readonly packMemberName: (member: TPackMember) => string;

  /** Subject ignored-policy: name-based check against the supplied ignored set. */
  readonly isIgnoredName: (name: string, ignored: ReadonlySet<string>) => boolean;

  /** Activation state for a pack-member installed row. */
  readonly packMemberActivation: (member: TPackMember) => ActivationState;

  /** Filter actual occurrences to those that match a given installed name. */
  readonly attachActualToInstalled: (
    name: string,
    actual: ReadonlyArray<TActualEntry<TActual>>,
  ) => ReadonlyArray<TActualEntry<TActual>>;

  /**
   * Subject-policy filter for unmanaged actual occurrences. Returns `true` if
   * the occurrence is NOT claimed by subject-specific policy.
   */
  readonly notClaimedBySubjectPolicy: (entry: TActualEntry<TActual>) => boolean;

  /** Build a subject installed row from the assembled facts. */
  readonly buildInstalledRow: (
    input: BuildInstalledRowInput<TDeclared, TResolved, TActual, TPackMember>,
  ) => TInstalled;

  /** Build a subject unmanaged row from one actual occurrence. */
  readonly buildUnmanagedRow: (entry: TActualEntry<TActual>) => TUnmanaged;

  /**
   * Build an ignored row from a declared candidate. When the subject's
   * `TDeclared` resolves to `ReadonlyArray<never>` (no settings entry shape),
   * `input.declared` has type `never` so the body is statically uninhabitable
   * and `return input.declared` satisfies any return type without a throw.
   */
  readonly buildDeclaredIgnoredRow: (input: BuildDeclaredIgnoredRowInput<TDeclared>) => TIgnored;

  /**
   * Build an ignored row from a pack-member candidate. When the subject's
   * `TPackMember` resolves to `never` (the subject cannot have pack members,
   * e.g. packs themselves), `input.member` has type `never` so the body is
   * statically uninhabitable and `return input.member` satisfies any return
   * type without a throw.
   */
  readonly buildPackMemberIgnoredRow: (
    input: BuildPackMemberIgnoredRowInput<TPackMember>,
  ) => TIgnored;

  /** Build an ignored row from an actual candidate. */
  readonly buildActualIgnoredRow: (input: BuildActualIgnoredRowInput<TActual>) => TIgnored;

  /** Build the orphan-resolved warning published when a resolved entry has no home. */
  readonly resolvedOrphanWarning: (name: string) => Warning;
}

/**
 * Input passed to `buildInstalledRow`. Carries everything the subject needs
 * to construct its installed row.
 */
export interface BuildInstalledRowInput<TDeclared, TResolved, TActual, TPackMember> {
  readonly name: string;
  readonly installationOrigin: InstallationOrigin<TDeclaredEntry<TDeclared>, TPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<TResolvedEntry<TResolved>>;
  readonly actual: ReadonlyArray<TActualEntry<TActual>>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

/** Input passed to `buildDeclaredIgnoredRow`. */
export interface BuildDeclaredIgnoredRowInput<TDeclared> {
  readonly name: string;
  readonly declared: TDeclaredEntry<TDeclared>;
}

/** Input passed to `buildPackMemberIgnoredRow`. */
export interface BuildPackMemberIgnoredRowInput<TPackMember> {
  readonly name: string;
  readonly member: TPackMember;
  readonly pack: InstalledPackRef;
}

/** Input passed to `buildActualIgnoredRow`. */
export interface BuildActualIgnoredRowInput<TActual> {
  readonly name: string;
  readonly actual: TActualEntry<TActual>;
}

// ---------------------------------------------------------------------------
// Helper input / output
// ---------------------------------------------------------------------------

export interface ProjectInstalledExtensionsInput<
  TDeclared,
  TResolved,
  TActual,
  TPack,
  TPackMember,
  TInstalled,
  TUnmanaged,
  TIgnored,
> {
  readonly subjectKey: string;
  readonly declared: Effect.Effect<Option.Option<TDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TActual>;
  readonly installedPacks: Effect.Effect<ReadonlyArray<TPack>>;
  readonly packMembers: (pack: TPack) => ReadonlyArray<TPackMember>;
  readonly packRef: (pack: TPack) => InstalledPackRef;
  readonly ignoredNames: ReadonlySet<string>;
  readonly policy: SubjectPolicy<
    TDeclared,
    TResolved,
    TActual,
    TPackMember,
    TInstalled,
    TUnmanaged,
    TIgnored
  >;
  readonly diagnostics: Diagnostics;
}

export interface ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged, TIgnored> {
  readonly installed: ReadonlyArray<TInstalled>;
  readonly active: ReadonlyArray<TInstalled>;
  readonly unmanaged: ReadonlyArray<TUnmanaged>;
  readonly ignored: ReadonlyArray<TIgnored>;
}

export const makeProjectedSubjectCells = <
  TDeclaredEntry extends { readonly name: string },
  TDeclared extends ReadonlyArray<TDeclaredEntry>,
  TResolved,
  TActual,
  TInstalled extends RowWithKey,
  TUnmanaged,
  TIgnored,
>(args: {
  readonly declared: Effect.Effect<Option.Option<TDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TActual>;
  readonly project: Effect.Effect<
    ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged, TIgnored>
  >;
}) => ({
  declared: args.declared,
  resolved: args.resolved,
  actual: args.actual,
  installed: args.project.pipe(Effect.map((out) => out.installed)),
  byName: (name: string) => args.project.pipe(Effect.map((out) => findByName(out.installed, name))),
  declaredByName: (name: string) =>
    args.declared.pipe(
      Effect.map((opt) =>
        Option.flatMap(opt, (rows) =>
          Option.fromUndefinedOr(rows.find((row) => row.name === name)),
        ),
      ),
    ),
  active: args.project.pipe(Effect.map((out) => out.active)),
  unmanaged: args.project.pipe(Effect.map((out) => out.unmanaged)),
  ignored: args.project.pipe(Effect.map((out) => out.ignored)),
});

// ---------------------------------------------------------------------------
// Source-tolerance helpers
// ---------------------------------------------------------------------------

const tolerateDeclared = <T>(
  effect: Effect.Effect<Option.Option<T>, SettingsReadError>,
  diagnostics: Diagnostics,
  subjectKey: string,
): Effect.Effect<Option.Option<T>> =>
  effect.pipe(
    Effect.catch((err) => {
      const code =
        err._tag === "SettingsIoError"
          ? "settings-io"
          : err._tag === "SettingsParseError"
            ? "settings-parse"
            : "settings-decode";
      const warning: Warning = {
        source: "settings",
        message: `${subjectKey}: degraded settings — ${err._tag}`,
        path: err.path,
        code,
      };
      return diagnostics.append(warning).pipe(Effect.as(Option.none<T>()));
    }),
  );

const tolerateResolved = <T>(
  effect: Effect.Effect<Option.Option<T>, LockfileReadError>,
  diagnostics: Diagnostics,
  subjectKey: string,
): Effect.Effect<Option.Option<T>> =>
  effect.pipe(
    Effect.catch((err) => {
      const code =
        err._tag === "LockfileIoError"
          ? "lockfile-io"
          : err._tag === "LockfileParseError"
            ? "lockfile-parse"
            : "lockfile-decode";
      const warning: Warning = {
        source: "lockfile",
        message: `${subjectKey}: degraded lockfile — ${err._tag}`,
        path: err.path,
        code,
      };
      return diagnostics.append(warning).pipe(Effect.as(Option.none<T>()));
    }),
  );

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

/**
 * Compose installed/active/unmanaged/ignored from declared/resolved/actual
 * plus the installed-pack set, per the projection invariant.
 *
 * The returned effect never fails — it absorbs source-read failures via the
 * supplied `diagnostics` buffer.
 */
export const projectInstalledExtensions = <
  TDeclared,
  TResolved,
  TActual,
  TPack,
  TPackMember,
  TInstalled,
  TUnmanaged,
  TIgnored,
>(
  input: ProjectInstalledExtensionsInput<
    TDeclared,
    TResolved,
    TActual,
    TPack,
    TPackMember,
    TInstalled,
    TUnmanaged,
    TIgnored
  >,
): Effect.Effect<ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged, TIgnored>> =>
  Effect.gen(function* () {
    const {
      subjectKey,
      declared,
      resolved,
      actual,
      installedPacks,
      packMembers,
      packRef,
      ignoredNames,
      policy,
      diagnostics,
    } = input;

    // 1. Read the three layers + installed packs; absorb declared/resolved
    //    failures into diagnostics.
    const declaredOpt = yield* tolerateDeclared(declared, diagnostics, subjectKey);
    const resolvedOpt = yield* tolerateResolved(resolved, diagnostics, subjectKey);
    const actualPayload = yield* actual;
    const packs = yield* installedPacks;

    // 2. Iterate raw evidence into per-name lookups using first-wins
    //    deduplication. `dedupeFirstByName` builds an immutable Map keyed by
    //    the policy-derived name; subsequent entries with the same name are
    //    dropped, so the projection stays deterministic.
    const emptyDeclared: ReadonlyArray<TDeclaredEntry<TDeclared>> = [];
    const emptyResolved: ReadonlyArray<TResolvedEntry<TResolved>> = [];
    const declaredEntries = Option.match(declaredOpt, {
      onNone: () => emptyDeclared,
      onSome: (d) => policy.declaredEntries(d),
    });
    const resolvedEntries = Option.match(resolvedOpt, {
      onNone: () => emptyResolved,
      onSome: (r) => policy.resolvedEntries(r),
    });
    const actualEntries = policy.actualEntries(actualPayload);

    const declaredByName: ReadonlyMap<string, TDeclaredEntry<TDeclared>> = dedupeFirstByName(
      declaredEntries,
      policy.declaredName,
    );
    const resolvedByName: ReadonlyMap<string, TResolvedEntry<TResolved>> = dedupeFirstByName(
      resolvedEntries,
      policy.resolvedName,
    );

    // 3. Pack-member rollup. First pack to provide a member name wins for
    //    placement; subsequent providers extend the `providingPacks` list. The
    //    accumulator builds an immutable Map keyed by member name with
    //    concat-on-add provider lists.
    interface MemberState {
      readonly member: TPackMember;
      readonly pack: InstalledPackRef;
      readonly providingPacks: ReadonlyArray<InstalledPackRef>;
    }
    const packMemberPairs: ReadonlyArray<readonly [TPackMember, InstalledPackRef]> = packs.flatMap(
      (pack) => {
        const ref = packRef(pack);
        return packMembers(pack).map((member) => [member, ref] as const);
      },
    );
    const memberByName: ReadonlyMap<string, MemberState> = packMemberPairs.reduce<
      Map<string, MemberState>
    >((acc, [member, ref]) => {
      const name = policy.packMemberName(member);
      const existing = acc.get(name);
      const next = new Map(acc);
      if (existing === undefined) {
        next.set(name, { member, pack: ref, providingPacks: [ref] });
      } else {
        next.set(name, {
          member: existing.member,
          pack: existing.pack,
          providingPacks: [...existing.providingPacks, ref],
        });
      }
      return next;
    }, new Map<string, MemberState>());

    // 4. Build ignored rows from declared, pack-member, and actual candidates.
    //    Each subject's policy supplies a per-source builder; the helper does
    //    not construct a discriminated union and never throws on unreachable
    //    branches — `never`-typed inputs make the corresponding policy bodies
    //    statically uninhabitable.
    const isIgnored = (name: string) => policy.isIgnoredName(name, ignoredNames);

    const declaredIgnored: ReadonlyArray<readonly [string, TIgnored]> = Array.getSomes(
      Array.fromIterable(declaredByName.entries()).map(([name, declared]) =>
        isIgnored(name)
          ? Option.some([name, policy.buildDeclaredIgnoredRow({ name, declared })] as const)
          : Option.none<readonly [string, TIgnored]>(),
      ),
    );
    const ignoredDeclaredNames: ReadonlySet<string> = new Set(
      declaredIgnored.map(([name]) => name),
    );

    const memberIgnored: ReadonlyArray<readonly [string, TIgnored]> = Array.getSomes(
      Array.fromIterable(memberByName.entries()).map(([name, state]) =>
        isIgnored(name)
          ? Option.some([
              name,
              policy.buildPackMemberIgnoredRow({ name, member: state.member, pack: state.pack }),
            ] as const)
          : Option.none<readonly [string, TIgnored]>(),
      ),
    );
    const ignoredMemberNames: ReadonlySet<string> = new Set(memberIgnored.map(([name]) => name));

    const actualIgnored: ReadonlyArray<readonly [TActualEntry<TActual>, TIgnored]> = Array.getSomes(
      actualEntries.map((entry) => {
        const name = policy.actualName(entry);
        return isIgnored(name)
          ? Option.some([entry, policy.buildActualIgnoredRow({ name, actual: entry })] as const)
          : Option.none<readonly [TActualEntry<TActual>, TIgnored]>();
      }),
    );
    const ignoredActuals: ReadonlySet<TActualEntry<TActual>> = new Set(
      actualIgnored.map(([entry]) => entry),
    );

    const ignoredRows: ReadonlyArray<TIgnored> = [
      ...declaredIgnored.map(([, row]) => row),
      ...memberIgnored.map(([, row]) => row),
      ...actualIgnored.map(([, row]) => row),
    ];

    // 5. Build direct + implicit rows. Track names alongside rows so we can
    //    sort and derive activation without inspecting the opaque `TInstalled`
    //    shape. `Array.filterMap` skips ignored names in a single pass.
    interface NamedRow {
      readonly name: string;
      readonly row: TInstalled;
      readonly activation: ActivationState;
    }
    const visibleActuals: ReadonlyArray<TActualEntry<TActual>> = actualEntries.filter(
      (a) => !ignoredActuals.has(a),
    );

    const direct: ReadonlyArray<NamedRow> = Array.getSomes(
      Array.fromIterable(declaredByName.entries()).map(([name, entry]) => {
        if (ignoredDeclaredNames.has(name)) return Option.none<NamedRow>();
        const activation = policy.declaredActivation(entry);
        const memberState = memberByName.get(name);
        const providingPacks: ReadonlyArray<InstalledPackRef> =
          memberState === undefined ? [] : memberState.providingPacks;
        const attached = policy.attachActualToInstalled(name, visibleActuals);
        const row = policy.buildInstalledRow({
          name,
          installationOrigin: { _tag: "direct", declared: entry },
          activation,
          resolved: Option.fromUndefinedOr(resolvedByName.get(name)),
          actual: attached,
          providingPacks,
        });
        return Option.some({ name, row, activation });
      }),
    );

    // 6. Implicit pack-member rows: skip names already declared (direct wins,
    //    including disabled) and skip ignored names.
    const implicit: ReadonlyArray<NamedRow> = Array.getSomes(
      Array.fromIterable(memberByName.entries()).map(([name, state]) => {
        if (declaredByName.has(name)) return Option.none<NamedRow>(); // direct wins
        if (ignoredMemberNames.has(name)) return Option.none<NamedRow>();
        const activation = policy.packMemberActivation(state.member);
        const attached = policy.attachActualToInstalled(name, visibleActuals);
        const row = policy.buildInstalledRow({
          name,
          installationOrigin: {
            _tag: "pack-member",
            member: state.member,
            pack: state.pack,
          },
          activation,
          resolved: Option.fromUndefinedOr(resolvedByName.get(name)),
          actual: attached,
          providingPacks: state.providingPacks,
        });
        return Option.some({ name, row, activation });
      }),
    );

    // 7. Sort by name for deterministic ordering.
    const installedNamed: ReadonlyArray<NamedRow> = [...direct, ...implicit].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const installedNames: ReadonlySet<string> = new Set(installedNamed.map((r) => r.name));
    const installed: ReadonlyArray<TInstalled> = installedNamed.map((r) => r.row);
    const active: ReadonlyArray<TInstalled> = installedNamed
      .filter((r) => r.activation === "enabled")
      .map((r) => r.row);

    // 8. Orphaned-resolved diagnostics: any resolved entry whose name is
    //    neither declared nor present as a pack-member. Collect orphan names
    //    first, then publish sequentially via Effect.forEach to keep the
    //    diagnostics buffer in deterministic order.
    const orphanNames: ReadonlyArray<string> = Array.fromIterable(resolvedByName.keys()).filter(
      (name) => !declaredByName.has(name) && !memberByName.has(name),
    );
    yield* Effect.forEach(
      orphanNames,
      (name) => diagnostics.append(policy.resolvedOrphanWarning(name)),
      { discard: true },
    );

    // 9. Unmanaged: actual occurrences not ignored, not claimed by an
    //    installed row, and passing subject policy.
    const unmanaged: ReadonlyArray<TUnmanaged> = Array.getSomes(
      actualEntries.map((entry) => {
        if (ignoredActuals.has(entry)) return Option.none<TUnmanaged>();
        const name = policy.actualName(entry);
        if (installedNames.has(name)) return Option.none<TUnmanaged>();
        if (!policy.notClaimedBySubjectPolicy(entry)) return Option.none<TUnmanaged>();
        return Option.some(policy.buildUnmanagedRow(entry));
      }),
    );

    return {
      installed,
      active,
      unmanaged,
      ignored: ignoredRows,
    } satisfies ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged, TIgnored>;
  });

/**
 * Build a name-indexed read-only map, keeping the first occurrence per name.
 * Subsequent entries with the same name are dropped; the original input order
 * determines which one wins. Pure helper used to dedupe declared/resolved
 * entry arrays.
 */
const dedupeFirstByName = <Entry>(
  entries: ReadonlyArray<Entry>,
  nameOf: (entry: Entry) => string,
): ReadonlyMap<string, Entry> =>
  entries.reduce<Map<string, Entry>>((acc, entry) => {
    const name = nameOf(entry);
    if (acc.has(name)) return acc;
    const next = new Map(acc);
    next.set(name, entry);
    return next;
  }, new Map<string, Entry>());
