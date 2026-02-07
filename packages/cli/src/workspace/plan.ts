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

export interface JobStep<TOperation> {
  readonly operation: TOperation;
  readonly action: "execute" | "no-op" | "error";
  readonly reason: Option<string>;
  readonly label: string;
}

export interface Job<TOperation> {
  readonly steps: ReadonlyArray<JobStep<TOperation>>;
  readonly concurrency: "unbounded" | 1;
}

export interface Plan<TOperation> {
  readonly name: string;
  readonly description: Option<string>;
  readonly jobs: ReadonlyArray<Job<TOperation>>;
}
