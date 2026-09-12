/** Deterministic credential storage for materialization consumers. */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { McpSecretStore, type McpSecretStoreService } from "./mcps/secret-store.js";

/** What an in-memory credential store recorded, and the layer that backs it. */
export interface MemoryMcpSecretStore {
  readonly layer: Layer.Layer<McpSecretStore>;
  /** Every account currently holding a value, keyed by account digest. */
  readonly entries: ReadonlyMap<string, string>;
}

/**
 * An in-memory credential store for MCP install tests.
 *
 * `failWrites` stands for a keychain that is present but refuses to persist —
 * locked, full, or denied — which is the condition the install reports as a
 * credential action rather than a failed closure.
 */
export const makeMemoryMcpSecretStore = (options?: {
  readonly failWrites?: boolean;
  /** Values already held, keyed by account digest. */
  readonly initial?: Readonly<Record<string, string>>;
}): MemoryMcpSecretStore => {
  const entries = new Map<string, string>(Object.entries(options?.initial ?? {}));
  const failWrites = options?.failWrites ?? false;

  const service: McpSecretStoreService = {
    read: (account) => Effect.sync(() => Option.fromNullOr(entries.get(account) ?? null)),
    write: (account, value) =>
      Effect.sync(() => {
        if (failWrites) return "failed";
        entries.set(account, value);
        return "saved";
      }),
    erase: (account) => Effect.sync(() => (entries.delete(account) ? "deleted" : "absent")),
  };

  return { layer: Layer.succeed(McpSecretStore, service), entries };
};
