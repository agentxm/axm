/**
 * The route an invocation resolved to: the command words after `axm`, exactly
 * as the parser matched them against the registered command tree. Telemetry,
 * the machine-output envelope, interruption replay and every recovery line a
 * command offers read the invoked route here, so no command restates its own
 * place in the tree.
 *
 * The dispatcher provides it; outside a dispatched invocation it is empty.
 */

import * as ServiceMap from "effect/Context";

export const CommandRoute = ServiceMap.Reference<ReadonlyArray<string>>(
  "axm.sh/cli-runtime/command-route/CommandRoute",
  { defaultValue: () => [] },
);
