/** Verified source trees retained for one workspace transition. */

import { fromFileLocation } from "@agentxm/host-primitives";
import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type { TreeIntegrity } from "../workspace-state/index.js";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionFiles } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { StepFailure } from "../operations/index.js";
import { PackageMaterializationFailed } from "./errors.js";
import { gitTransportContextFingerprint } from "./git-transport-context.js";

export interface RegistryContentIdentity {
  readonly sourceLocation: URL;
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: Option.Option<string>;
  readonly publisherBindingId: string;
}

export const registryContentKey = (identity: RegistryContentIdentity): string =>
  JSON.stringify([
    "registry",
    identity.sourceLocation.href,
    identity.owner,
    identity.type,
    identity.name,
    identity.version,
    Option.getOrUndefined(identity.integrity),
    identity.publisherBindingId,
  ]);

export const registryRefContentKey = (
  ref: Extract<ExtensionRef, { readonly refType: "registry" }>,
): string =>
  registryContentKey({
    sourceLocation: ref.source.location,
    owner: ref.owner,
    type: ref.type,
    name: ref.name,
    version: ref.version,
    integrity: ref.integrity,
    publisherBindingId: ref.publisherBindingId,
  });

/** Distinguish sources by the immutable selection and its origin. */
export const sourceRefContentKey = (ref: ExtensionRef): string => {
  switch (ref.refType) {
    case "registry":
      return registryRefContentKey(ref);
    case "http":
      return JSON.stringify([
        "http",
        ref.source.url.href,
        ref.source.kind,
        ref.source.entry,
        ref.distribution?.packageRoot ?? ref.sourcePath,
        ref.distribution?.format ?? "native",
        ref.snapshot,
      ]);
    case "git-hosted":
      return JSON.stringify([
        "git",
        ref.source.url.href,
        gitTransportContextFingerprint(),
        ref.gitCommitSha,
        ref.gitTreeSha,
        ref.distribution?.packageRoot ?? ref.sourcePath ?? ".",
        ref.distribution?.format ?? "native",
      ]);
    case "local": {
      const location = fromFileLocation(ref.location).replaceAll("\\", "/");
      const component = ref.distribution?.componentPath;
      const suffix = component === undefined || component === "." ? "" : `/${component}`;
      const root =
        suffix !== "" && location.endsWith(suffix) ? location.slice(0, -suffix.length) : location;
      return JSON.stringify(["path", root, ref.distribution?.format ?? "native"]);
    }
    case "workspace":
      return JSON.stringify(["workspace", ref.location, ref.type, ref.name]);
  }
};

export interface AcquiredContentService {
  /** Bounded by the candidate's selected source packages; discarded after execution. */
  readonly materializedPackages?: Ref.Ref<ReadonlyMap<string, TreeIntegrity>>;
  readonly requestedKeys: ReadonlySet<string>;
  readonly filesByKey: ReadonlyMap<string, ExtensionFiles>;
  readonly failuresByKey: ReadonlyMap<string, StepFailure>;
}

/** Present only while a candidate consumes the trees acquired for that candidate. */
export class AcquiredContent extends ServiceMap.Service<AcquiredContent, AcquiredContentService>()(
  "@agentxm/workspace-kernel/acquisition/AcquiredContent",
) {}

/** Remember publication only within the current candidate and exact acquisition. */
export const recordMaterializedPackage = (
  ref: ExtensionRef,
  destination: string,
  integrity: TreeIntegrity,
) =>
  Effect.gen(function* () {
    const acquired = yield* Effect.serviceOption(AcquiredContent);
    const cache = Option.isSome(acquired) ? acquired.value.materializedPackages : undefined;
    if (cache === undefined) return;
    const key = JSON.stringify([sourceRefContentKey(ref), destination]);
    yield* Ref.update(cache, (current) => new Map(current).set(key, integrity));
  });

/** How a reader would obtain a source's bytes when the transition holds none. */
export type AcquiredContentRetrieval = "on-disk" | "remote";

/** The transition holds no bytes for a source and the reader may not obtain them otherwise. */
export class SourceNotAcquired extends Data.TaggedError("SourceNotAcquired")<{
  readonly subject: string;
  /** `not-acquired`: selected but never acquired, a planner invariant broken; `not-selected`: remote retrieval the plan never selected. */
  readonly reason: "not-acquired" | "not-selected";
  readonly detail: string;
}> {}

/**
 * The one policy for a source's bytes during a workspace transition.
 *
 * - No transition context: none; the reader uses its ordinary source.
 * - Selected and acquired: the acquired tree.
 * - Selected but never acquired: a planner invariant is broken; fails.
 * - Not selected: an on-disk reader continues on its ordinary path, because a
 *   non-forced reconcile of Git-hosted and local content declares nothing and
 *   reads what is already installed; a remote reader is refused, because the
 *   transition retrieves nothing its plan did not select.
 */
const acquiredContentForKey = (
  key: string,
  subject: string,
  retrieval: AcquiredContentRetrieval,
): Effect.Effect<Option.Option<ExtensionFiles>, SourceNotAcquired> =>
  Effect.gen(function* () {
    const acquired = yield* Effect.serviceOption(AcquiredContent);
    if (Option.isNone(acquired)) return Option.none();
    const files = acquired.value.filesByKey.get(key);
    if (files !== undefined) return Option.some(files);
    if (acquired.value.requestedKeys.has(key)) {
      return yield* new SourceNotAcquired({
        subject,
        reason: "not-acquired",
        detail: `${subject} was selected for this workspace transition but was not acquired before it`,
      });
    }
    if (retrieval === "remote") {
      return yield* new SourceNotAcquired({
        subject,
        reason: "not-selected",
        detail: `${subject} was not selected for acquisition; the workspace transition retrieves nothing its plan did not select`,
      });
    }
    return Option.none();
  });

/** The transition's bytes for one source ref, or none when the reader uses its ordinary source. */
export const acquiredFilesForRef = (
  ref: ExtensionRef,
  retrieval: AcquiredContentRetrieval,
): Effect.Effect<Option.Option<ExtensionFiles>, SourceNotAcquired, Path.Path> =>
  Effect.gen(function* () {
    if (ref.refType === "workspace") return Option.none();
    const captured = yield* acquiredContentForKey(
      sourceRefContentKey(ref),
      `${ref.type} ${ref.name}`,
      retrieval,
    );
    if (Option.isNone(captured) || ref.refType === "registry" || ref.distribution === undefined)
      return captured;
    const path = yield* Path.Path;
    const packageDirectory = captured.value.packageDirectory ?? captured.value.directory;
    return Option.some({
      ...captured.value,
      packageDirectory,
      directory: path.join(packageDirectory, ref.distribution.componentPath),
      componentPath: ref.distribution.componentPath,
    });
  });

/** The transition's bytes for one Registry package, which is only ever retrieved remotely. */
export const acquiredRegistryPackageFiles = (
  identity: RegistryContentIdentity,
): Effect.Effect<Option.Option<ExtensionFiles>, SourceNotAcquired> =>
  acquiredContentForKey(
    registryContentKey(identity),
    `Registry package ${identity.owner}/${identity.type}/${identity.name}@${identity.version}`,
    "remote",
  );

/** Resolve external bytes from the transition's captured tree when one is active. */
export const acquiredDirectoryForRef = (ref: ExtensionRef, ordinaryPath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const files = yield* acquiredFilesForRef(ref, "on-disk");
    if (Option.isSome(files)) return files.value.packageDirectory ?? files.value.directory;
    return (ref.refType === "local" || ref.refType === "git-hosted" || ref.refType === "http") &&
      ref.distribution !== undefined
      ? path.resolve(
          ordinaryPath,
          ...ref.distribution.componentPath
            .split("/")
            .filter((segment) => segment !== ".")
            .map(() => ".."),
        )
      : ordinaryPath;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new PackageMaterializationFailed({ path: ordinaryPath, step: "prepare-staging", cause }),
    ),
  );
