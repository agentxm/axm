/**
 * The transaction ledger: one immutable value holding every pre-mutation
 * preimage the active transaction took, which closure each belongs to, the
 * per-closure first-touch dedupe set, the OS-temporary snapshot store, and
 * every closure rollback that could not complete. The transaction context
 * holds it in one `SynchronizedRef`, so registration, settlement, and
 * rollback are serialized transitions of a single value rather than
 * coordinated writes to several mutable members.
 *
 * Module-private to the package: only the context and the transaction runner
 * read or transition it.
 */

import type { PathState } from "./path-state.js";
import type { WorkspaceRecoveryEntry } from "./errors.js";

export interface RetiredEntry {
  readonly target: string;
  readonly backup: string;
  readonly original: PathState;
  readonly storeIdentity: string;
}

/** One pre-mutation preimage of a protected path, keyed to its owning closure. */
export type Snapshot = {
  readonly closure: string | undefined;
  /** Physical ancestor and declared-root routes captured before this boundary's first write. */
  readonly route: {
    readonly parents: PathState;
    readonly nativeRoot: string;
    readonly physicalRoot: string;
    readonly rootLink: string | undefined;
  };
  /** Last proven state after AXM's own writes; foreign divergence refuses restoration. */
  readonly expected: PathState;
  /** Original entry identities, retained separately from mutable postimages. */
  readonly preimage: PathState;
  readonly retirements?: ReadonlyArray<RetiredEntry>;
} & (
  | { readonly target: string; readonly state: "absent" }
  | { readonly target: string; readonly state: "copied"; readonly backup: string }
  | { readonly target: string; readonly state: "symlink"; readonly linkTarget: string }
);

/** A closure rollback that could not complete, recorded for the transaction end. */
export interface PendingClosureRestoration {
  readonly closureId: string;
  readonly restorationCause: unknown;
  readonly retained: ReadonlyArray<string>;
  readonly recovery: ReadonlyArray<WorkspaceRecoveryEntry>;
}

export interface TransactionLedger {
  /** Uniquely prefixed OS-temporary directory holding rollback snapshots. */
  readonly snapshotDir: string | undefined;
  /** Monotonic backup-name counter: settlement drops entries, names never recur. */
  readonly snapshotSequence: number;
  /** Per-closure first-touch dedupe; the key "" is the operation closure. */
  readonly protectedTargets: ReadonlyMap<string, ReadonlySet<string>>;
  /** Lexical inputs already resolved during this operation, for alias freshness. */
  readonly resolvedEntries: ReadonlyMap<string, string>;
  readonly snapshots: ReadonlyArray<Snapshot>;
  /** Closure rollbacks that failed; the transaction fails typed at its end. */
  readonly pendingRestorations: ReadonlyArray<PendingClosureRestoration>;
}

export const emptyLedger: TransactionLedger = {
  snapshotDir: undefined,
  snapshotSequence: 0,
  protectedTargets: new Map(),
  resolvedEntries: new Map(),
  snapshots: [],
  pendingRestorations: [],
};

export const closureKey = (closure: string | undefined): string => closure ?? "";

export const isProtected = (
  ledger: TransactionLedger,
  closure: string | undefined,
  target: string,
): boolean => ledger.protectedTargets.get(closureKey(closure))?.has(target) ?? false;

/** The ledger after one snapshot joins its closure's protected set. */
export const withSnapshot = (
  ledger: TransactionLedger,
  snapshot: Snapshot,
  store: { readonly snapshotDir: string | undefined; readonly snapshotSequence: number },
): TransactionLedger => {
  const key = closureKey(snapshot.closure);
  const protectedForClosure = new Set(ledger.protectedTargets.get(key) ?? []);
  protectedForClosure.add(snapshot.target);
  const protectedTargets = new Map(ledger.protectedTargets);
  protectedTargets.set(key, protectedForClosure);
  return {
    snapshotDir: store.snapshotDir,
    snapshotSequence: store.snapshotSequence,
    protectedTargets,
    resolvedEntries: ledger.resolvedEntries,
    snapshots: [...ledger.snapshots, snapshot],
    pendingRestorations: ledger.pendingRestorations,
  };
};

export const closureSnapshots = (
  ledger: TransactionLedger,
  closureId: string,
): ReadonlyArray<Snapshot> => ledger.snapshots.filter((snapshot) => snapshot.closure === closureId);

/**
 * The ledger with one closure's snapshots and protected set dropped: its
 * commits stand (or were restored), so a later closure touching the same
 * target takes a fresh preimage.
 */
export const withoutClosure = (ledger: TransactionLedger, closureId: string): TransactionLedger => {
  const protectedTargets = new Map(ledger.protectedTargets);
  protectedTargets.delete(closureId);
  return {
    ...ledger,
    protectedTargets,
    snapshots: ledger.snapshots.filter((snapshot) => snapshot.closure !== closureId),
  };
};

export const withPendingRestoration = (
  ledger: TransactionLedger,
  pending: PendingClosureRestoration,
): TransactionLedger => ({
  ...ledger,
  pendingRestorations: [...ledger.pendingRestorations, pending],
});
