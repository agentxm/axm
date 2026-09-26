import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";

export class McpConnectionConflict extends Data.TaggedError("McpConnectionConflict")<{
  readonly localName: string;
  readonly requestedIdentity: string;
  readonly owningIdentity: string;
}> {}

/** A local path retains its accepted identity however the request spells it. */
export const settleMcpSourceIdentity = (input: {
  readonly localName: ExtensionName;
  readonly requestedIdentity: string;
  readonly requestedLocalPath: string | null;
  /** A missing connection is available; an inline connection has no source identity. */
  readonly existing:
    { readonly sourceIdentity: string | null; readonly localPath: string | null } | undefined;
}): Effect.Effect<string, McpConnectionConflict> => {
  const settled =
    input.existing?.localPath !== null &&
    input.existing?.localPath !== undefined &&
    input.existing.sourceIdentity !== null &&
    input.requestedLocalPath !== null &&
    input.existing.localPath === input.requestedLocalPath
      ? input.existing.sourceIdentity
      : input.requestedIdentity;
  return input.existing === undefined || input.existing.sourceIdentity === settled
    ? Effect.succeed(settled)
    : Effect.fail(
        new McpConnectionConflict({
          localName: input.localName,
          requestedIdentity: input.requestedIdentity,
          owningIdentity: input.existing.sourceIdentity ?? "inline",
        }),
      );
};
