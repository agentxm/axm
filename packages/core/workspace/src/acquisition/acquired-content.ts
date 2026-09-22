/** Verified source trees retained for one workspace transition. */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionFiles } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { StepFailure } from "../transitions/planning/plan/errors.js";
import { PackageMaterializationFailed } from "./errors.js";

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
  readonly filesByKey: ReadonlyMap<string, ExtensionFiles>;
  readonly failuresByKey: ReadonlyMap<string, StepFailure>;
}

/** Present only while a candidate consumes the trees acquired for that candidate. */
export class AcquiredContent extends ServiceMap.Service<AcquiredContent, AcquiredContentService>()(
  "@agentxm/workspace/acquisition/AcquiredContent",
) {}

/** Resolve external bytes from the transition's captured tree when one is active. */
export const acquiredDirectoryForRef = (ref: ExtensionRef, ordinaryPath: string) =>
  Effect.gen(function* () {
    if (ref.refType === "workspace") return ordinaryPath;
    const acquired = yield* Effect.serviceOption(AcquiredContent);
    if (Option.isNone(acquired)) return ordinaryPath;
    const files = acquired.value.filesByKey.get(sourceRefContentKey(ref));
    if (files !== undefined) return files.directory;
    return yield* new PackageMaterializationFailed({
      path: ordinaryPath,
      step: "prepare-staging",
      cause: "The selected source was not acquired before the workspace transition",
    });
  });
