/** Verified source trees retained for one workspace transition. */

import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionFiles } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { StepFailure } from "../transitions/planning/plan/errors.js";
import { PackageMaterializationFailed } from "./errors.js";
import { gitTransportContextFingerprint } from "../resolution/sources/git/operations.js";

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
    case "git-hosted":
      return JSON.stringify([
        "git",
        ref.source.url.href,
        gitTransportContextFingerprint(),
        ref.gitCommitSha,
        ref.gitTreeSha,
        ref.sourcePath ?? ".",
        ref.type,
        ref.name,
      ]);
    case "local":
      return JSON.stringify(["path", ref.location, ref.sourcePath ?? ".", ref.type, ref.name]);
    case "workspace":
      return JSON.stringify(["workspace", ref.location, ref.type, ref.name]);
  }
};

export interface AcquiredContentService {
  readonly requestedKeys: ReadonlySet<string>;
  readonly filesByKey: ReadonlyMap<string, ExtensionFiles>;
  readonly failuresByKey: ReadonlyMap<string, StepFailure>;
}

/** Present only while a candidate consumes the trees acquired for that candidate. */
export class AcquiredContent extends ServiceMap.Service<AcquiredContent, AcquiredContentService>()(
  "@agentxm/workspace/acquisition/AcquiredContent",
) {}

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
): Effect.Effect<Option.Option<ExtensionFiles>, SourceNotAcquired> =>
  ref.refType === "workspace"
    ? Effect.succeed(Option.none())
    : acquiredContentForKey(sourceRefContentKey(ref), `${ref.type} ${ref.name}`, retrieval);

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
export const acquiredDirectoryForRef = (
  ref: ExtensionRef,
  ordinaryPath: string,
): Effect.Effect<string, PackageMaterializationFailed> =>
  acquiredFilesForRef(ref, "on-disk").pipe(
    Effect.map(Option.match({ onNone: () => ordinaryPath, onSome: (files) => files.directory })),
    Effect.mapError(
      (cause) =>
        new PackageMaterializationFailed({ path: ordinaryPath, step: "prepare-staging", cause }),
    ),
  );
