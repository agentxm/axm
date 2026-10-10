import type * as Effect from "effect/Effect";
import type { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
import type { DisableExtension, EnableExtension } from "./set-activation.js";

type DisableServices = Effect.Services<ReturnType<typeof DisableExtension.prepare>>;
type EnableServices = Effect.Services<ReturnType<typeof EnableExtension.prepare>>;
const _disableHasNoReleaseAge = true as const satisfies [
  Extract<DisableServices, ReleaseAgePosture>,
] extends [never]
  ? true
  : false;
const _enableHasReleaseAge = true as const satisfies [
  Extract<EnableServices, ReleaseAgePosture>,
] extends [never]
  ? false
  : true;

export type ActivationDependencies = [typeof _disableHasNoReleaseAge, typeof _enableHasReleaseAge];
