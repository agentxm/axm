/**
 * Binds the extension-sources registry resolution policy port to the
 * resolution capability. Only the composition root sees both: the
 * integration declares the port and `@agentxm/extension-resolution` owns
 * the release-age and named-target policy.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Layer from "effect/Layer";
import {
  decideNamedRegistryVersion,
  namedRegistryCandidates,
  resolveVersionEntryWithReleaseAge,
} from "@agentxm/extension-resolution";
import { RegistryResolutionPolicy } from "@agentxm/extension-sources";

export const RegistryResolutionPolicyLive = Layer.succeed(RegistryResolutionPolicy, {
  selectVersion: resolveVersionEntryWithReleaseAge,
  decideNamedVersion: decideNamedRegistryVersion,
  namedCandidates: namedRegistryCandidates,
});
