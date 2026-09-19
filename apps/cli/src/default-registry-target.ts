import * as ServiceMap from "effect/Context";

export interface DefaultRegistryTargetService {
  readonly name: string;
  readonly url: string;
}

/** The effective default Registry selected for this CLI invocation. */
export class DefaultRegistryTarget extends ServiceMap.Service<
  DefaultRegistryTarget,
  DefaultRegistryTargetService
>()("axm.sh/runtime/DefaultRegistryTarget") {}
