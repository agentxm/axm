import * as Context from "effect/Context";

/** Invocation policy consumed by network adapters before they acquire host resources. */
export const NetworkDisabled = Context.Reference<boolean>(
  "@agentxm/host-primitives/NetworkDisabled",
  {
    defaultValue: () => false,
  },
);
