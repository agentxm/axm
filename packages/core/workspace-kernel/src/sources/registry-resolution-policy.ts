/**
 * Registry resolution policy port.
 *
 * The registry host provider owns index retrieval, ref mapping, and archive
 * probing; which version a request selects under the minimum-release-age
 * policy is application policy that lives in `@agentxm/workspace/resolution`.
 * This integration may not import that core package, so it declares the
 * port and the composition root binds the policy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as ServiceMap from "effect/Context";

import type {
  NamedRegistryCandidate,
  NamedRegistryFindOptions,
  NamedRegistryVersionDecision,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry/schema";

/**
 * Decisions the registry provider delegates to the resolution policy.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RegistryResolutionPolicyService {
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
>()("@agentxm/workspace/resolution/sources/registry-resolution-policy/RegistryResolutionPolicy") {}
