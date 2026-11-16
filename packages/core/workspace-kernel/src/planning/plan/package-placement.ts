/** Package placement admission and the filesystem preimages the candidate captures. */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { pathsOverlap, resolveNativeEntry } from "../../locations/index.js";
import { acquiredDirectoryForRef, sourceRefContentKey } from "../../acquisition/index.js";
import { fromFileLocation } from "@agentxm/host-primitives";
import { StepFailure } from "../../operations/index.js";
import {
  LockfileReader,
  WorkspaceLocation,
  acceptedPackageAddressClaims,
  packageAddressClaimForRef,
  validatePackageAddressClaims,
  workspaceStateReadFailureToStepFailure,
  type PackageAddressClaim,
} from "../../workspace-state/index.js";

export const preflightPackagePlacement = (
  acquisitionRefs: ReadonlyArray<ExtensionRef>,
  exposureRefs: ReadonlyArray<ExtensionRef>,
) =>
  Effect.gen(function* () {
    const selected: PackageAddressClaim[] = [];
    const paths: string[] = [];
    const snapshots = new Map<string, string>();
    // A source listed by several refs (its acquisition and each exposure) is one
    // filesystem identity; its first resolution in this call already placed both
    // of its paths, so a repeat could only push what the result keeps once.
    const resolvedSources = new Set<string>();
    // Closures may read accepted bytes before another closure advances that
    // package. Those exposures still need address/ownership checks, but only
    // selected acquisitions must agree on the snapshot that will be written.
    // Registry exposure authorization independently checks every exact ref.
    for (const { ref, acquire } of [
      ...acquisitionRefs.map((ref) => ({ ref, acquire: true })),
      ...exposureRefs.map((ref) => ({ ref, acquire: false })),
    ]) {
      if (ref.refType === "workspace") continue;
      if (ref.refType === "local") {
        const source = yield* acquiredDirectoryForRef(ref, fromFileLocation(ref.location)).pipe(
          Effect.mapError(
            (cause) =>
              new StepFailure({
                category: "validation",
                detail: "Cannot capture the complete local source package for review.",
                cause,
              }),
          ),
        );
        if (!resolvedSources.has(source)) {
          const physical = yield* resolveNativeEntry(source).pipe(
            Effect.mapError(
              (cause) =>
                new StepFailure({
                  category: "validation",
                  detail: "Cannot establish the local source's filesystem identity.",
                  cause,
                }),
            ),
          );
          paths.push(source, physical.referentPath ?? physical.entryPath);
          resolvedSources.add(source);
        }
      }
      const claim = packageAddressClaimForRef(ref);
      if (Result.isFailure(claim))
        return yield* new StepFailure({ category: "validation", detail: claim.failure.detail });
      if (acquire && ref.refType !== "local") {
        const snapshot = sourceRefContentKey(ref);
        const prior = snapshots.get(claim.success.packageKey);
        if (prior !== undefined && prior !== snapshot)
          return yield* new StepFailure({
            category: "conflict",
            detail: `Selected components disagree on the snapshot for retained package ${claim.success.address}; resolve the complete package again`,
          });
        snapshots.set(claim.success.packageKey, snapshot);
      }
      selected.push(claim.success);
    }
    if (selected.length === 0) return [];
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const lock = yield* (yield* LockfileReader).lockfile.pipe(
      Effect.mapError(workspaceStateReadFailureToStepFailure),
    );
    const accepted = acceptedPackageAddressClaims(lock);
    if (Result.isFailure(accepted))
      return yield* new StepFailure({ category: "validation", detail: accepted.failure.detail });
    const valid = validatePackageAddressClaims(
      [...accepted.success, ...selected],
      layout.acquiredRoot,
    );
    if (Result.isFailure(valid))
      return yield* new StepFailure({ category: "conflict", detail: valid.failure.detail });
    const path = yield* Path.Path;
    const acceptedKeys = new Set(accepted.success.map((claim) => claim.packageKey));
    const physicalClaims: Array<{ readonly packageKey: string; readonly address: string }> = [];
    // An accepted binding and a selected component of one package, or several
    // components of it, claim the same destination. Its first resolution in this
    // call is the check; a repeat could only report what that one already did.
    const examined = new Set<string>();
    for (const claim of [...accepted.success, ...selected]) {
      const identity = JSON.stringify([claim.packageKey, claim.address]);
      if (examined.has(identity)) continue;
      examined.add(identity);
      const destination = path.join(layout.acquiredRoot, ...claim.address.split("/"));
      if (selected.some((item) => item.packageKey === claim.packageKey)) paths.push(destination);
      const observed = yield* resolveNativeEntry(destination).pipe(
        Effect.mapError(
          (cause) =>
            new StepFailure({
              category: "conflict",
              detail: `Cannot verify retained package destination ${claim.address}`,
              cause,
            }),
        ),
      );
      const physical = observed.referentPath ?? observed.entryPath;
      const overlapping = physicalClaims.find(
        (prior) =>
          prior.packageKey !== claim.packageKey && pathsOverlap(path, prior.address, physical),
      );
      if (overlapping !== undefined)
        return yield* new StepFailure({
          category: "conflict",
          detail: `Retained package source addresses overlap through filesystem aliases: ${overlapping.packageKey} at ${overlapping.address} and ${claim.packageKey} at ${claim.address}`,
        });
      physicalClaims.push({ packageKey: claim.packageKey, address: physical });
      if (!acceptedKeys.has(claim.packageKey) && observed.kind !== "absent")
        return yield* new StepFailure({
          category: "conflict",
          detail: `Retained package destination ${claim.address} contains content without accepted ownership; move it before installing this source`,
        });
      if (!acceptedKeys.has(claim.packageKey)) {
        for (const suffix of [".axm-staging", ".axm-backup"]) {
          const scratch = yield* resolveNativeEntry(`${destination}${suffix}`).pipe(
            Effect.mapError(
              (cause) =>
                new StepFailure({
                  category: "conflict",
                  detail: `Cannot verify retained package staging boundary ${claim.address}${suffix}`,
                  cause,
                }),
            ),
          );
          if (scratch.kind !== "absent")
            return yield* new StepFailure({
              category: "conflict",
              detail: `Retained package destination ${claim.address}${suffix} contains content without accepted ownership; move it before installing this source`,
            });
          paths.push(`${destination}${suffix}`);
        }
      }
    }
    return [...new Set(paths)];
  });
