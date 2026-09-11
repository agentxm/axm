/**
 * @agentxm/extension-resolution deterministic test ports and decoders.
 *
 * The two services a resolution keeps in `R` until its command boundary — the
 * minimum-release-age posture the operator decides, and the official AXM
 * skill compatibility policy — bound to fixed values, plus the branded-value
 * decoders a fixture needs to state a handle, name, version, or range.
 * Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Layer from "effect/Layer";

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";

import {
  AxmSkillCompatibilityPolicy,
  makeAxmSkillCompatibilityPolicyLayer,
} from "./axm-skill-compatibility.js";
import { ReleaseAgePosture, type ReleaseAgePostureValue } from "./release-age-posture.js";

/**
 * The release-age gate's posture for one run. `"enforce"` withholds a
 * candidate that has not reached the configured minimum release age, which is
 * the product's default; pass `"ignore"` to model the operator taking it for
 * this run only.
 */
export const ReleaseAgePostureTest = (
  posture: ReleaseAgePostureValue = "enforce",
): Layer.Layer<ReleaseAgePosture> => Layer.succeed(ReleaseAgePosture, posture);

/**
 * The real official-skill compatibility policy, evaluated against a stated CLI
 * version rather than the running executable's. `null` models an executable
 * that reports no version, which the policy must still answer for.
 */
export const AxmSkillCompatibilityPolicyTest = (
  cliVersion: string | null,
): Layer.Layer<AxmSkillCompatibilityPolicy> => makeAxmSkillCompatibilityPolicyLayer(cliVersion);

/** The handle a fixture names, decoded into its branded form. */
export const handle = (value: string): Handle => decodeHandleSync(value);

/** The extension name a fixture names, decoded into its branded form. */
export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

/** One exact version, decoded into its branded form. */
export const exactVersion = (value: string): Version => decodeVersionSync(value);

/** One version range, decoded into its branded form. */
export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);
