import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";

export class McpConnectionConflict extends Data.TaggedError("McpConnectionConflict")<{
  readonly reason: string;
}> {}

/** One local name must retain its source: a connection to a different source is refused. */
export const admitMcpLocalName = (input: {
  readonly localName: ExtensionName;
  readonly sourceIdentity: string;
  /** A missing connection is available; an inline connection has no source identity. */
  readonly localConnection: { readonly sourceIdentity: string | null } | undefined;
}): Effect.Effect<void, McpConnectionConflict> =>
  input.localConnection === undefined ||
  input.localConnection.sourceIdentity === input.sourceIdentity
    ? Effect.void
    : Effect.fail(
        new McpConnectionConflict({
          reason: `Local MCP name "${input.localName}" is already owned by a different source`,
        }),
      );
