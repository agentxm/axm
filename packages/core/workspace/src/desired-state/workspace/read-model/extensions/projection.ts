/**
 * Shared projection helper: composes installed/unmanaged from
 * declared/resolved/actual, and shapes Pack-member rows from the bindings
 * the desired-state graph decided.
 *
 * ```ts
 * direct = declared.filter(declaresAcquisition).map(withInstallationOrigin("direct"));
 * installed = direct;
 * unmanaged = actual
 *   .filter(notClaimedByInstalled)
 *   .filter(notClaimedBySubjectPolicy);
 * members = bindings
 *   .filter(notDeclaredByName) // direct (incl. disabled) wins
 *   .map(withInstallationOrigin("pack-member"));
 * ```
 *
 * The read model never decides Pack membership or a member's activation:
 * both are reachability facts the desired-state graph owns. A caller that
 * holds the graph passes each member's binding in, and the subject shapes the
 * row — attaching the member's accepted resolution and observed occurrences —
 * without judging it.
 *
 * The helper does NOT own subject row shape or subject policy. Both come in as
 * parameters via `SubjectPolicy<...>`.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions/common";
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
// Pack-member bindings
// ---------------------------------------------------------------------------

/**
 * One Pack-supplied member as the desired-state graph decided it: the Pack
 * that supplies it and whether it is active once every origin and preference
 * has had its say.
 */
export interface PackMemberBinding {
  readonly name: ExtensionName;
  readonly pack: InstalledPackRef;
  readonly enabled: boolean;
}

// ---------------------------------------------------------------------------
// Subject policy contract
// ---------------------------------------------------------------------------

/**
 * Subject-specific policy callbacks the projection helper requires.
 */
export interface SubjectPolicy<TDeclared, TResolved, TActual, TPackMember, TInstalled, TUnmanaged> {
  /** Iterate the subject's declared entries from a decoded `declared` payload. */
  readonly declaredEntries: (declared: TDeclared) => ReadonlyArray<TDeclaredEntry<TDeclared>>;

  /** Extract the subject name from a declared entry. */
  readonly declaredName: (entry: TDeclaredEntry<TDeclared>) => string;

  /**
   * Activation state derived from a declared entry.
   */
  readonly declaredActivation: (entry: TDeclaredEntry<TDeclared>) => ActivationState;

  /**
   * Whether a declared entry declares acquisition.
   *
   * A source-less entry configures a member some Pack supplies. It is not an
   * independent installation, so it produces no direct row — it only adjusts
   * the pack-member row that already exists.
   */
  readonly declaresAcquisition: (entry: TDeclaredEntry<TDeclared>) => boolean;

  /** Iterate the subject's resolved entries from a decoded `resolved` payload. */
  readonly resolvedEntries: (resolved: TResolved) => ReadonlyArray<TResolvedEntry<TResolved>>;

  /** Extract the subject name from a resolved entry. */
  readonly resolvedName: (entry: TResolvedEntry<TResolved>) => string;

  /** Iterate the subject's actual occurrences from an `actual` payload. */
  readonly actualEntries: (actual: TActual) => ReadonlyArray<TActualEntry<TActual>>;

  /** Extract the subject name from an actual occurrence. */
  readonly actualName: (entry: TActualEntry<TActual>) => string;

  /** The member entry a Pack-supplied row carries, from the binding the graph decided. */
  readonly packMember: (binding: PackMemberBinding) => TPackMember;

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
}

// ---------------------------------------------------------------------------
// Helper input / output
// ---------------------------------------------------------------------------

/** The three source layers one subject reads, and the policy that names them. */
export interface SubjectProjectionInput<
  TDeclared,
  TResolved,
  TActual,
  TPackMember,
  TInstalled,
  TUnmanaged,
> {
  readonly declared: Effect.Effect<Option.Option<TDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TActual>;
  readonly policy: SubjectPolicy<
    TDeclared,
    TResolved,
    TActual,
    TPackMember,
    TInstalled,
    TUnmanaged
  >;
}

export interface ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged> {
  readonly installed: ReadonlyArray<TInstalled>;
  readonly unmanaged: ReadonlyArray<TUnmanaged>;
}

export const makeProjectedSubjectCells = <
  TDeclaredEntry extends { readonly name: string },
  TDeclared extends ReadonlyArray<TDeclaredEntry>,
  TResolved,
  TActual,
  TInstalled extends RowWithKey,
  TUnmanaged,
>(args: {
  readonly declared: Effect.Effect<Option.Option<TDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TActual>;
  readonly project: Effect.Effect<
    ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged>,
    SettingsReadError | LockfileReadError
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
  unmanaged: args.project.pipe(Effect.map((out) => out.unmanaged)),
});

// ---------------------------------------------------------------------------
// Source layers
// ---------------------------------------------------------------------------

/**
 * Read the three layers into per-name lookups. Invalid persisted authority
 * fails the read instead of being treated as absent, and first-wins
 * deduplication keeps the projection deterministic.
 */
const readSubjectLayers = <TDeclared, TResolved, TActual, TPackMember, TInstalled, TUnmanaged>(
  input: SubjectProjectionInput<TDeclared, TResolved, TActual, TPackMember, TInstalled, TUnmanaged>,
) =>
  Effect.gen(function* () {
    const { policy } = input;
    const declaredOpt = yield* input.declared;
    const resolvedOpt = yield* input.resolved;
    const actualPayload = yield* input.actual;
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
    return {
      declaredByName: dedupeFirstByName(declaredEntries, policy.declaredName),
      resolvedByName: dedupeFirstByName(resolvedEntries, policy.resolvedName),
      actualEntries: policy.actualEntries(actualPayload),
    };
  });

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Compose installed and unmanaged rows from declared/resolved/actual.
 *
 * Only a declared entry that acquires produces an installed row. A disabled
 * direct row still claims its actual occurrences, so they are never reported
 * as unmanaged.
 */
export const projectInstalledExtensions = <
  TDeclared,
  TResolved,
  TActual,
  TPackMember,
  TInstalled,
  TUnmanaged,
>(
  input: SubjectProjectionInput<TDeclared, TResolved, TActual, TPackMember, TInstalled, TUnmanaged>,
): Effect.Effect<
  ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged>,
  SettingsReadError | LockfileReadError
> =>
  Effect.gen(function* () {
    const { policy } = input;
    const { declaredByName, resolvedByName, actualEntries } = yield* readSubjectLayers(input);

    interface NamedRow {
      readonly name: string;
      readonly row: TInstalled;
    }
    const direct: ReadonlyArray<NamedRow> = Array.getSomes(
      Array.fromIterable(declaredByName.entries()).map(([name, entry]) => {
        // A configuration-only entry acquires nothing, so it is not a route.
        if (!policy.declaresAcquisition(entry)) return Option.none<NamedRow>();
        const row = policy.buildInstalledRow({
          name,
          installationOrigin: { _tag: "direct", declared: entry },
          activation: policy.declaredActivation(entry),
          resolved: Option.fromUndefinedOr(resolvedByName.get(name)),
          actual: policy.attachActualToInstalled(name, actualEntries),
        });
        return Option.some({ name, row });
      }),
    );
    const installedNamed = [...direct].sort((a, b) => a.name.localeCompare(b.name));
    const installedNames: ReadonlySet<string> = new Set(installedNamed.map((r) => r.name));

    const unmanaged: ReadonlyArray<TUnmanaged> = Array.getSomes(
      actualEntries.map((entry) => {
        const name = policy.actualName(entry);
        if (installedNames.has(name)) return Option.none<TUnmanaged>();
        if (!policy.notClaimedBySubjectPolicy(entry)) return Option.none<TUnmanaged>();
        return Option.some(policy.buildUnmanagedRow(entry));
      }),
    );

    return {
      installed: installedNamed.map((r) => r.row),
      unmanaged,
    } satisfies ProjectInstalledExtensionsOutput<TInstalled, TUnmanaged>;
  });

/**
 * Shape the rows of the Pack-supplied members the graph bound for this
 * subject. A member a declared entry also acquires has a direct row already,
 * so it produces no member row; every other binding becomes one row carrying
 * the activation the graph decided.
 */
export const projectPackMemberRows = <
  TDeclared,
  TResolved,
  TActual,
  TPackMember,
  TInstalled,
  TUnmanaged,
>(
  input: SubjectProjectionInput<
    TDeclared,
    TResolved,
    TActual,
    TPackMember,
    TInstalled,
    TUnmanaged
  > & { readonly bindings: ReadonlyArray<PackMemberBinding> },
): Effect.Effect<ReadonlyArray<TInstalled>, SettingsReadError | LockfileReadError> =>
  Effect.gen(function* () {
    const { policy } = input;
    const { declaredByName, resolvedByName, actualEntries } = yield* readSubjectLayers(input);
    const seen = new Set<string>();
    return [...input.bindings]
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((binding) => {
        const name = binding.name;
        if (seen.has(name)) return [];
        seen.add(name);
        const declaredEntry = declaredByName.get(name);
        if (declaredEntry !== undefined && policy.declaresAcquisition(declaredEntry)) return [];
        return [
          policy.buildInstalledRow({
            name,
            installationOrigin: {
              _tag: "pack-member",
              member: policy.packMember(binding),
              pack: binding.pack,
            },
            activation: binding.enabled ? "enabled" : "disabled",
            resolved: Option.fromUndefinedOr(resolvedByName.get(name)),
            actual: policy.attachActualToInstalled(name, actualEntries),
          }),
        ];
      });
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
