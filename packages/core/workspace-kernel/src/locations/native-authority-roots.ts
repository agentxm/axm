import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type { NativeDirectoryInputs } from "./declared-native-locations.js";
import {
  assertNativeMutationWithin,
  NativeLocationError,
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeEntryAddress,
} from "./native-address.js";

/** Only roots captured from the selected scope's explicit native inputs grant authority. */
export const nativeAuthorityRoots = (
  path: Path.Path,
  args: { readonly workspaceRoot: string; readonly scope: "project" | "user" },
  inputs: NativeDirectoryInputs,
): ReadonlyArray<string> => [
  ...new Set([
    path.resolve(args.workspaceRoot),
    ...(args.scope === "project"
      ? []
      : [
          inputs.xdgConfigRoot,
          ...Object.values(inputs.userConfigRootOverrides ?? {}),
          ...Object.values(inputs.skillsDirectoryOverrides),
        ]
          .filter((root): root is string => root !== undefined && root.trim().length > 0)
          .map((root) => path.resolve(args.workspaceRoot, root))),
  ]),
];

const contains = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
};

const directoryIdentity = (target: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(target);
    if (info.type !== "Directory" || Option.isNone(info.ino) || Option.isNone(info.birthtime)) {
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "native-root-identity-unavailable",
      });
    }
    return {
      device: info.dev,
      inode: info.ino.value,
      birthtime: info.birthtime.value.getTime(),
      mode: info.mode,
    };
  });

export interface NativeAuthorityRootWitness {
  readonly nativeRoot: string;
  readonly observed: Option.Option<{
    readonly physicalRoot: string;
    readonly entryPath: string;
    readonly linkTarget: string | undefined;
    readonly anchorPath: string;
    readonly anchor: {
      readonly device: number;
      readonly inode: number;
      readonly birthtime: number;
      readonly mode: number;
    };
    readonly parentPath: string;
    readonly parent: {
      readonly device: number;
      readonly inode: number;
      readonly birthtime: number;
      readonly mode: number;
    };
  }>;
}

/** Capture once at the owning invocation boundary; failed roots remain unusable. */
export const captureNativeAuthorityRoots = (
  roots: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<NativeAuthorityRootWitness>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.forEach(roots, (nativeRoot) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const address = yield* resolveNativeEntry(nativeRoot);
      const physicalRoot = yield* resolveNativeReferent(nativeRoot);
      // Creation can introduce this exact root, never undeclared missing ancestors.
      const anchorPath = address.kind === "absent" ? path.dirname(physicalRoot) : physicalRoot;
      const anchor = yield* directoryIdentity(anchorPath);
      const parentPath = path.dirname(physicalRoot);
      const parent = yield* directoryIdentity(parentPath);
      return {
        physicalRoot,
        entryPath: address.entryPath,
        linkTarget: address.linkTarget,
        anchorPath,
        anchor,
        parentPath,
        parent,
      };
    }).pipe(
      Effect.option,
      Effect.map((observed) => ({ nativeRoot, observed })),
    ),
  );

const verifyRoot = (witness: NativeAuthorityRootWitness) =>
  Effect.gen(function* () {
    if (Option.isNone(witness.observed)) return false;
    const expected = witness.observed.value;
    const address = yield* resolveNativeEntry(witness.nativeRoot);
    if (
      (yield* resolveNativeReferent(witness.nativeRoot)) !== expected.physicalRoot ||
      address.entryPath !== expected.entryPath ||
      address.linkTarget !== expected.linkTarget
    )
      return false;
    return (
      JSON.stringify(yield* directoryIdentity(expected.anchorPath)) ===
        JSON.stringify(expected.anchor) &&
      JSON.stringify(yield* directoryIdentity(expected.parentPath)) ===
        JSON.stringify(expected.parent)
    );
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/** Select one bounded physical root; a failed selected root never falls back to broader authority. */
export const assertNativeMutationWithinRoots = (
  roots: ReadonlyArray<string>,
  target: string,
  mutation: "entry" | "content" = "entry",
  ownerRoot: string,
  witnesses?: ReadonlyArray<NativeAuthorityRootWitness>,
): Effect.Effect<
  { readonly nativeRoot: string; readonly address: NativeEntryAddress },
  NativeLocationError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const address = yield* resolveNativeEntry(target);
    const boundary = mutation === "content" ? address.referentPath : address.entryPath;
    if (boundary === undefined)
      return yield* new NativeLocationError({ target, reason: "dangling-ancestor" });
    const candidates: Array<{ readonly nativeRoot: string; readonly physicalRoot: string }> = [];
    for (const nativeRoot of roots) {
      const physicalRoot = yield* resolveNativeReferent(nativeRoot).pipe(Effect.option);
      if (Option.isSome(physicalRoot) && contains(path, physicalRoot.value, boundary))
        candidates.push({ nativeRoot, physicalRoot: physicalRoot.value });
    }
    const selected = candidates.sort(
      (left, right) => right.physicalRoot.length - left.physicalRoot.length,
    )[0];
    if (selected === undefined) return yield* new NativeLocationError({ target, reason: "escape" });
    if (witnesses !== undefined) {
      const witness = witnesses.find((entry) => entry.nativeRoot === selected.nativeRoot);
      if (witness === undefined || !(yield* verifyRoot(witness)))
        return yield* new NativeLocationError({
          target,
          reason: "unreadable",
          cause: "native-root-changed",
        });
    }
    const physicalOwner = yield* resolveNativeReferent(ownerRoot);
    if (selected.physicalRoot !== physicalOwner) {
      const runtimeMarker = path.join(selected.physicalRoot, ".axm");
      const conflict =
        (yield* fs.exists(path.join(selected.physicalRoot, "axm.json"))) ||
        ((yield* fs.exists(runtimeMarker)) && !contains(path, runtimeMarker, physicalOwner));
      if (conflict) return yield* new NativeLocationError({ target, reason: "workspace-conflict" });
    }
    return {
      nativeRoot: selected.nativeRoot,
      address: yield* assertNativeMutationWithin(selected.nativeRoot, target, mutation, ownerRoot),
    };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof NativeLocationError
        ? cause
        : new NativeLocationError({ target, reason: "unreadable", cause }),
    ),
  );
