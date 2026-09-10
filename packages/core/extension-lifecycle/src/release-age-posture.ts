/**
 * The minimum-release-age gate's posture for one invocation.
 *
 * A leaf cannot invent this value: `makeConfiguredReleaseAgeEvaluation` reads
 * it from context, so every gated code path carries the requirement up to the
 * command boundary that owns the operator's decision. A command is
 * gate-blockable precisely when its execution requests this service, which is
 * what the conformance specification reads instead of a hand-copied list.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

/**
 * `"enforce"` withholds a candidate that has not reached the configured
 * minimum release age; `"ignore"` takes it for this run only. Neither value
 * changes settings, and a declared exemption outranks both.
 */
export type ReleaseAgePostureValue = "enforce" | "ignore";

export class ReleaseAgePosture extends ServiceMap.Service<
  ReleaseAgePosture,
  ReleaseAgePostureValue
>()("axm.sh/extension-lifecycle/ReleaseAgePosture") {}
