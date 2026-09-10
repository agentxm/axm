/**
 * Registry resolution policy port.
 *
 * The registry host provider owns index retrieval, ref mapping, and archive
 * probing; which version a request selects under the minimum-release-age
 * policy is application policy that lives in `@agentxm/extension-resolution`.
 * This integration may not import that core package, so it declares the
 * port and the composition root binds the policy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as ServiceMap from "effect/Context";
import type * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type {
  NamedRegistryCandidate,
  NamedRegistryFindOptions,
  NamedRegistryVersionDecision,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type {
  ExtensionIndex,
  VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";

/**
 * Decisions the registry provider delegates to the resolution policy.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RegistryResolutionPolicyService {
  /** Select the version an index-backed find returns for a range and optional minimum release age. */
  readonly selectVersion: (
    versions: ReadonlyArray<VersionEntry>,
    versionRange: Option.Option<string>,
    minimumReleaseAge: Option.Option<Duration.Duration>,
  ) => Effect.Effect<Option.Option<VersionEntry>>;
  /** Decide which version of a visible index a named request selects. */
  readonly decideNamedVersion: (
    index: ExtensionIndex,
    options: NamedRegistryFindOptions,
  ) => NamedRegistryVersionDecision;
  /** Ordered candidates to verify one by one when selection depends on archive content. */
  readonly namedCandidates: (
    index: ExtensionIndex,
    options: NamedRegistryFindOptions,
  ) => ReadonlyArray<NamedRegistryCandidate>;
}

/**
 * @experimental This API is unstable and may change without notice.
 */
export class RegistryResolutionPolicy extends ServiceMap.Service<
  RegistryResolutionPolicy,
  RegistryResolutionPolicyService
>()("@agentxm/extension-sources/registry-resolution-policy/RegistryResolutionPolicy") {}
