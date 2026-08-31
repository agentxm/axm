/**
 * Interruption-signal source port.
 *
 * The process-entry adapter records which signal requested termination; the
 * kernel reads that fact through this port when it resolves an interrupted
 * apply. When no source is provided, the kernel assumes SIGINT.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

export interface InterruptionSignalSourceService {
  readonly requestedSignal: () => "SIGINT" | "SIGTERM" | undefined;
}

export class InterruptionSignalSource extends ServiceMap.Service<
  InterruptionSignalSource,
  InterruptionSignalSourceService
>()("@agentxm/extension-management/unstable/plan/interruption-signal/InterruptionSignalSource") {}
