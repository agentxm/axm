import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";

/** A requested source other than the one that owns the local MCP name. */
export interface McpSourceIdentityConflict {
  readonly localName: string;
  readonly requestedIdentity: string;
  readonly owningIdentity: string;
}

/** The connection that already owns a local name, as admission compares it. */
export type McpSourceOwner<Identity> =
  | { readonly kind: "inline" }
  | {
      readonly kind: "sourced";
      /** The source the owner is bound or accepted from; none while it is unresolved. */
      readonly identity: Option.Option<Identity>;
      /** The absolute directory a path-sourced owner names. */
      readonly localPath: string | null;
      /** The locator the owner declares, compared only while it is unresolved. */
      readonly locator: string;
      /** How the owner is shown in a refusal. */
      readonly display: string;
    };

/** How admission keys, compares, and shows one structured source identity. */
export interface McpSourceAdmissionCodec<Identity, Key> {
  readonly encode: (identity: Identity) => Key;
  readonly equals: (left: Identity, right: Identity) => boolean;
  /** How a source is shown in a refusal; never its key. */
  readonly display: (identity: Identity) => string;
}

/**
 * Admit a request for one local MCP name and settle the source closure it
 * joins. A request matches the owning connection by structured location: the
 * same bound or accepted source, the same local directory however the path is
 * spelled, or, while the owner is unresolved, the same declared locator. A
 * different source, or an inline owner, is refused.
 */
export const settleMcpSourceIdentity = <Identity, Key>(input: {
  readonly localName: ExtensionName;
  readonly requested: Identity;
  /** The absolute directory a path request names. */
  readonly requestedLocalPath: string | null;
  /** The locator the request prints. */
  readonly requestedLocator: string;
  /** Absent when the name is available. */
  readonly existing: McpSourceOwner<Identity> | undefined;
  readonly codec: McpSourceAdmissionCodec<Identity, Key>;
}): Effect.Effect<Key, McpSourceIdentityConflict> => {
  const { codec, existing } = input;
  const requestedKey = codec.encode(input.requested);
  if (existing === undefined) return Effect.succeed(requestedKey);
  const refuse = (owningIdentity: string) =>
    Effect.fail({
      localName: input.localName,
      requestedIdentity: codec.display(input.requested),
      owningIdentity,
    });
  if (existing.kind === "inline") return refuse("inline");
  // A local path retains its accepted identity however the request spells it.
  if (
    existing.localPath !== null &&
    input.requestedLocalPath !== null &&
    existing.localPath === input.requestedLocalPath
  ) {
    return Effect.succeed(
      Option.match(existing.identity, { onNone: () => requestedKey, onSome: codec.encode }),
    );
  }
  const matches = Option.match(existing.identity, {
    onNone: () => existing.locator === input.requestedLocator,
    onSome: (identity) => codec.equals(identity, input.requested),
  });
  return matches ? Effect.succeed(requestedKey) : refuse(existing.display);
};
