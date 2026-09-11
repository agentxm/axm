/**
 * The credential store MCP connection secrets are persisted in, declared as a
 * port so the materialization capability never reaches for a platform module
 * directly.
 *
 * Secrets are addressed by an opaque account derived from the workspace scope
 * root, the local connection name, the source identity, and the input name, so
 * two connections that share a source keep separate credentials and a
 * workspace never reads another workspace's.
 *
 * Every surface answers with a typed outcome rather than failing: a keychain
 * that is unavailable, locked, or refuses a write is an ordinary condition the
 * install reports as a warning, not a defect that aborts an applied closure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { createHash } from "node:crypto";

/** The credential-store service name every AXM MCP secret is filed under. */
export const MCP_SECRET_SERVICE = "axm-mcp";

/** What identifies one stored secret. */
export interface McpSecretIdentity {
  /** Absolute, resolved root of the workspace scope holding the connection. */
  readonly scopeRoot: string;
  /** The agent-native MCP key the connection is installed as. */
  readonly localName: string;
  /** The resolution key (registry) or workspace identity of the source. */
  readonly sourceIdentity: string;
}

/**
 * The account one secret is stored under: an opaque digest of the four facts
 * that make the credential unique, so no workspace path, connection name, or
 * source appears in the credential store in clear text.
 */
export const mcpSecretAccount = (
  args: McpSecretIdentity & { readonly inputName: string },
): string =>
  createHash("sha256")
    .update([args.scopeRoot, args.localName, args.sourceIdentity, args.inputName].join("\0"))
    .digest("hex");

/** What persisting one secret settled as. */
export type McpSecretWriteOutcome = "saved" | "failed";

/** What erasing one secret settled as. */
export type McpSecretEraseOutcome = "deleted" | "absent" | "failed";

export interface McpSecretStoreService {
  /** The stored value, or none when nothing is stored or the store is unavailable. */
  readonly read: (account: string) => Effect.Effect<Option.Option<string>>;
  /** Persist one value, answering whether the store accepted it. */
  readonly write: (account: string, value: string) => Effect.Effect<McpSecretWriteOutcome>;
  /** Erase one value, answering whether anything was there to erase. */
  readonly erase: (account: string) => Effect.Effect<McpSecretEraseOutcome>;
}

export class McpSecretStore extends ServiceMap.Service<McpSecretStore, McpSecretStoreService>()(
  "@agentxm/extension-materialization/mcps/McpSecretStore",
) {}
