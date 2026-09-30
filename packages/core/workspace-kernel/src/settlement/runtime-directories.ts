// @effect-diagnostics nodeBuiltinImport:off — Node rmdir supplies an atomic empty-only directory removal absent from FileSystem.remove
import { rmdir } from "node:fs/promises";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  assertNativeMutationWithin,
  captureContainerIdentity,
  verifyContainerIdentity,
  type ContainerIdentity,
} from "../locations/index.js";
import { WorkspaceDirectoryError } from "./errors.js";

/** Only successful exclusive mkdir calls establish creation authority. */
export const createWorkspaceDirectories = (args: {
  readonly nativeRoot: string;
  readonly workspaceDir: string;
  readonly target: string;
  /** Runtime ancestors can precede the workspace owner's creation. */
  readonly identityOwnerRoot?: string;
  readonly mode?: number;
  readonly prepare?: (target: string) => Effect.Effect<void, unknown>;
  readonly record: (identity: ContainerIdentity) => Effect.Effect<void>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const missing: string[] = [];
    const createdIdentities: ContainerIdentity[] = [];
    let ancestor = args.target;
    while (!(yield* fs.exists(ancestor))) {
      missing.push(ancestor);
      const parent = path.dirname(ancestor);
      if (parent === ancestor)
        return yield* new WorkspaceDirectoryError({
          path: args.target,
          step: "create",
          cause: "runtime-parent-absent",
        });
      ancestor = parent;
    }
    const ownerRoot = path.dirname(args.workspaceDir);
    const proof = { nativeRoot: ancestor, ownerRoot: ancestor, target: ancestor };
    const anchor = yield* captureContainerIdentity(proof);
    for (const directory of missing.reverse()) {
      yield* assertNativeMutationWithin(args.nativeRoot, directory, "entry", ownerRoot);
      if (!(yield* verifyContainerIdentity(anchor, proof)))
        return yield* new WorkspaceDirectoryError({
          path: directory,
          step: "create",
          cause: "runtime-parent-changed",
        });
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          if (args.prepare !== undefined) yield* args.prepare(directory);
          const created = yield* fs.makeDirectory(directory, { mode: args.mode }).pipe(
            Effect.as(true),
            Effect.catch((cause) =>
              cause.reason._tag === "AlreadyExists" ? Effect.succeed(false) : Effect.fail(cause),
            ),
          );
          if (created) {
            const identity = yield* captureContainerIdentity({
              nativeRoot: args.nativeRoot,
              ownerRoot,
              identityOwnerRoot: args.identityOwnerRoot ?? ownerRoot,
              target: directory,
            });
            yield* args.record(identity);
            createdIdentities.push(identity);
          }
        }),
      );
    }
    if (!(yield* verifyContainerIdentity(anchor, proof)))
      return yield* new WorkspaceDirectoryError({
        path: args.target,
        step: "create",
        cause: "runtime-parent-changed",
      });
    yield* captureContainerIdentity({
      nativeRoot: args.nativeRoot,
      ownerRoot,
      identityOwnerRoot: args.identityOwnerRoot ?? ownerRoot,
      target: args.target,
    });
    return createdIdentities;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof WorkspaceDirectoryError
        ? cause
        : new WorkspaceDirectoryError({ path: args.target, step: "create", cause }),
    ),
  );

/** rmdir refuses foreign additions atomically, including additions after the identity check. */
export const removeEmptyRuntimeDirectories = (identities: ReadonlyArray<ContainerIdentity>) =>
  Effect.forEach(
    [...identities].sort((left, right) => right.physicalPath.length - left.physicalPath.length),
    (identity) =>
      Effect.gen(function* () {
        if (
          !(yield* verifyContainerIdentity(identity, {
            nativeRoot: identity.nativeRoot,
            ownerRoot: identity.ownerRoot,
            identityOwnerRoot: identity.identityOwnerRoot,
            target: identity.target,
          }))
        )
          return;
        yield* Effect.tryPromise(() => rmdir(identity.physicalPath));
      }).pipe(Effect.ignore),
    { discard: true },
  );
