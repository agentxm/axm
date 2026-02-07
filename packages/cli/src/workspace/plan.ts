/**
 * Generic plan types for workspace operations.
 *
 * Parameterized over the operation type so they can be reused across
 * extension types (skills, commands, mcp-servers, rules) and operation
 * types (install, uninstall).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Option } from "effect/Option";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface Operation<TName extends string, TArgs> {
  readonly name: TName;
  readonly args: TArgs;
}

export interface Action<Op> {
  readonly op: Op;
  readonly action: "execute" | "no-op" | "error";
  readonly reason: Option<string>;
  readonly label: string;
}

export interface Job<Op> {
  readonly steps: ReadonlyArray<Action<Op>>;
  readonly concurrency: "unbounded" | 1;
}

export interface Plan<Op> {
  readonly name: string;
  readonly description: Option<string>;
  readonly jobs: ReadonlyArray<Job<Op>>;
}
