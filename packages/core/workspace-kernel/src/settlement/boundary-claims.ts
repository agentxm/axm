// @effect-diagnostics nodeBuiltinImport:off — OS account identity is independent of workspace environment routing
/** Active physical mutation claims; the transition lock supplies all lease mechanics. */
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";

import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import {
  WorkspaceBoundaryConflict,
  WorkspaceSnapshotError,
  type WorkspaceTransitionCompromised,
} from "./errors.js";
import { captureContainerIdentity } from "../locations/index.js";
import { removeEmptyRuntimeDirectories } from "./runtime-directories.js";
import { makeWorkspaceTransitionLock } from "./transition-lock.js";

/** Test composition only: null disables filesystem coordination for memory fixtures. */
export const BoundaryClaimsDirectory = Context.Reference<string | null | undefined>(
  "@agentxm/workspace-kernel/settlement/BoundaryClaimsDirectory",
  { defaultValue: () => undefined },
);

export interface BoundaryClaims {
  readonly claim: (targets: ReadonlyArray<string>) => Effect.Effect<void, WorkspaceSnapshotError>;
  readonly compromised: Effect.Effect<never, WorkspaceTransitionCompromised>;
  readonly isCompromised: () => boolean;
}

const Records = Schema.Array(
  Schema.Struct({
    token: Schema.String,
    owner: Schema.String,
    targets: Schema.Array(Schema.String),
  }),
);
type ClaimRecord = (typeof Records.Type)[number];

/** Physical, resolver-normalized paths only; never lexical prefixes or case folding. */
const overlaps = (path: Path.Path, left: string, right: string): boolean => {
  const contains = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
    );
  };
  return contains(left, right) || contains(right, left);
};

export const makeBoundaryClaims = (
  owner: string,
  directory: string | null | undefined,
): Effect.Effect<
  BoundaryClaims,
  WorkspaceSnapshotError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    if (directory === null)
      return { claim: () => Effect.void, compromised: Effect.never, isCompromised: () => false };
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lifetime = yield* Scope.Scope;
    const failure = (cause: unknown) =>
      cause instanceof WorkspaceSnapshotError
        ? cause
        : new WorkspaceSnapshotError({ target: owner, step: "inspect-target", cause });
    const home =
      directory === undefined
        ? yield* Effect.try({ try: () => userInfo().homedir, catch: failure })
        : directory;
    const namespace =
      directory === undefined
        ? path.join(
            yield* fs.realPath(home).pipe(Effect.mapError(failure)),
            ".axm-runtime",
            "physical-boundaries",
          )
        : path.resolve(directory);
    yield* fs
      .makeDirectory(namespace, { recursive: true, mode: 0o700 })
      .pipe(Effect.mapError(failure));
    const physicalNamespace = yield* fs.realPath(namespace).pipe(Effect.mapError(failure));
    // A retargetable coordinator would split the same principal into independent tables.
    if (physicalNamespace !== path.resolve(namespace))
      return yield* failure("aliased-boundary-coordination-directory");
    const table = path.join(namespace, "active.json");
    const token = yield* Effect.sync(randomUUID);
    const leaseDirectory = path.join(namespace, "leases", token);
    const admissionDirectory = path.join(namespace, "admission");
    const lock = yield* makeWorkspaceTransitionLock;
    const holder = { command: "physical-boundary-claims", candidateId: token, pid: process.pid };
    const leaseIsLive = (recordToken: string) =>
      Effect.gen(function* () {
        const directory = path.join(namespace, "leases", recordToken);
        const retired = yield* Effect.scoped(
          Effect.gen(function* () {
            const contender = yield* makeWorkspaceTransitionLock;
            const contention = yield* contender.acquire({
              workspaceDir: directory,
              nativeRoot: namespace,
              holder,
              waitBoundMillis: 0,
            });
            if (Option.isSome(contention)) {
              if (
                Option.isNone(contention.value.holder) ||
                contention.value.holder.value.candidateId !== recordToken
              )
                return yield* failure("uncertain-boundary-lease-owner");
              return undefined;
            }
            // Capture only this reclaimed token's runtime directories. Empty-only
            // retirement after release preserves unknown additions and replacements.
            return yield* Effect.forEach([directory, path.join(directory, "tmp")], (target) =>
              captureContainerIdentity({
                nativeRoot: namespace,
                ownerRoot: path.dirname(directory),
                identityOwnerRoot: namespace,
                target,
              }),
            );
          }),
        );
        if (retired === undefined) return true;
        yield* removeEmptyRuntimeDirectories(retired);
        yield* fs.remove(path.join(namespace, `${recordToken}.tmp`), { force: true });
        return false;
      });
    const read = fs.readFileString(table).pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound" ? Effect.succeed("[]") : Effect.fail(error),
      ),
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.fromJsonString(Records), { onExcessProperty: "error" }),
      ),
      Effect.flatMap((records) => {
        const tokens = new Set<string>();
        for (const record of records) {
          if (
            !/^[0-9a-f-]{36}$/.test(record.token) ||
            tokens.has(record.token) ||
            !path.isAbsolute(record.owner) ||
            record.targets.some(
              (target) =>
                !path.isAbsolute(target) ||
                path.normalize(target) !== target ||
                overlaps(path, target, namespace),
            )
          )
            return Effect.fail(failure("invalid-boundary-claim-record"));
          tokens.add(record.token);
        }
        return Effect.succeed(records);
      }),
      Effect.flatMap((records) =>
        Effect.gen(function* () {
          const directories = yield* fs
            .readDirectory(path.join(namespace, "leases"))
            .pipe(
              Effect.catchTag("PlatformError", (error) =>
                error.reason._tag === "NotFound" ? Effect.succeed([]) : Effect.fail(error),
              ),
            );
          for (const leaseToken of directories) {
            if (leaseToken === token || records.some((record) => record.token === leaseToken))
              continue;
            if (!/^[0-9a-f-]{36}$/.test(leaseToken) || (yield* leaseIsLive(leaseToken)))
              return yield* failure("unrecorded-active-boundary-lease");
          }
          return records;
        }),
      ),
      Effect.mapError(failure),
    );
    const write = (records: ReadonlyArray<ClaimRecord>) => {
      const temporary = path.join(namespace, `${token}.tmp`);
      return (
        records.length === 0
          ? fs.remove(table, { force: true })
          : fs
              .writeFileString(temporary, JSON.stringify(records), { mode: 0o600 })
              .pipe(Effect.andThen(fs.rename(temporary, table)))
      ).pipe(
        Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.ignore)),
        Effect.mapError(failure),
      );
    };
    const admitted = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.scoped(
        Effect.gen(function* () {
          // This mutex coordinates OS processes whose lease heartbeat uses real
          // time. Keep only its bounded admission wait on the adopted live clock;
          // application effects and generic transition-lock tests retain theirs.
          const contention = yield* lock
            .acquire({
              workspaceDir: admissionDirectory,
              nativeRoot: namespace,
              holder,
            })
            .pipe(Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()));
          if (Option.isSome(contention)) return yield* failure("boundary-admission-unavailable");
          const held = yield* lock.held(admissionDirectory);
          if (Option.isNone(held)) return yield* failure("boundary-admission-unowned");
          return yield* Effect.raceFirst(effect, held.value.compromised);
        }),
      ).pipe(Effect.mapError(failure));

    // Register the lease in the transaction's scope, never the short admission scope.
    yield* admitted(
      Effect.gen(function* () {
        const contention = yield* lock
          .acquire({
            workspaceDir: leaseDirectory,
            nativeRoot: namespace,
            holder,
            waitBoundMillis: 0,
          })
          .pipe(Effect.provideService(Scope.Scope, lifetime));
        if (Option.isSome(contention)) return yield* failure("boundary-lease-token-contended");
        const records = yield* read;
        yield* write([...records, { token, owner, targets: [] }]);
      }),
    );
    const lease = yield* lock.held(leaseDirectory);
    if (Option.isNone(lease)) return yield* failure("boundary-lease-unowned");
    // Runs before lease release, after transaction settlement, including rollback.
    yield* Effect.addFinalizer(() =>
      admitted(
        Effect.gen(function* () {
          if (lease.value.isCompromised()) return;
          const records = yield* read;
          yield* write(records.filter((record) => record.token !== token));
        }),
      ).pipe(Effect.ignore),
    );

    const claim: BoundaryClaims["claim"] = (targets) =>
      admitted(
        Effect.gen(function* () {
          if (lease.value.isCompromised()) return yield* failure("boundary-lease-compromised");
          for (const target of targets) {
            if (!path.isAbsolute(target) || overlaps(path, target, namespace))
              return yield* failure("boundary-overlaps-coordination-directory");
          }
          const records = yield* read;
          if (!records.some((record) => record.token === token && record.owner === owner))
            return yield* failure("boundary-claim-ownership-lost");
          const active: Array<ClaimRecord> = [];
          for (const record of records) {
            if (record.token === token) continue;
            // Only an acquired lease proves that the prior owner is gone. A pid,
            // timestamp observation, absent holder, or unreadable record never does.
            const live = yield* leaseIsLive(record.token);
            if (!live) continue;
            for (const existing of record.targets) {
              const target = targets.find((candidate) => overlaps(path, existing, candidate));
              if (target !== undefined)
                return yield* failure(
                  new WorkspaceBoundaryConflict({
                    reason: "overlap",
                    owner: record.owner,
                    target,
                    conflictingTarget: existing,
                  }),
                );
            }
            for (const existing of record.targets) {
              for (const target of targets) {
                // Case-folding is only an uncertainty detector for uncreated
                // spellings, never a physical identity or volume assumption.
                if (
                  overlaps(path, existing.toLowerCase(), target.toLowerCase()) &&
                  (!(yield* fs.exists(existing)) || !(yield* fs.exists(target)))
                ) {
                  return yield* failure(
                    new WorkspaceBoundaryConflict({
                      reason: "ambiguous-case",
                      owner: record.owner,
                      target,
                      conflictingTarget: existing,
                    }),
                  );
                }
              }
            }
            active.push(record);
          }
          const own = records.find((record) => record.token === token);
          if (own === undefined) return yield* failure("boundary-claim-ownership-lost");
          yield* write([
            ...active,
            { token, owner, targets: [...new Set([...own.targets, ...targets])] },
          ]);
        }),
      ).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
    return {
      claim,
      compromised: lease.value.compromised,
      isCompromised: lease.value.isCompromised,
    };
  });
