/** Verified source trees retained for one workspace transition. */

import * as ServiceMap from "effect/Context";
import * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionFiles } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { StepFailure } from "../transitions/planning/plan/errors.js";

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

export interface AcquiredContentService {
  readonly filesByRef: ReadonlyMap<ExtensionRef, ExtensionFiles>;
  readonly registryFiles: ReadonlyMap<string, ExtensionFiles>;
  readonly registryFailures: ReadonlyMap<string, StepFailure>;
}

/** Present only while a candidate consumes the trees acquired for that candidate. */
export class AcquiredContent extends ServiceMap.Service<AcquiredContent, AcquiredContentService>()(
  "@agentxm/workspace/acquisition/AcquiredContent",
) {}
