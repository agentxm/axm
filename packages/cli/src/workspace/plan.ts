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

import * as Option from "effect/Option";
import type { CliError } from "../cli-error/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface Operation<TName extends string, TArgs> {
  readonly name: TName;
  readonly args: TArgs;
}

export type OperationMap = Record<string, Operation<string, unknown>>;

export type OperationMapFromUnion<Op extends Operation<string, unknown>> = {
  [K in Op["name"]]: Extract<Op, { name: K }>;
};

export type OperationUnion<Ops extends OperationMap> = Ops[keyof Ops];

export type OperationResult =
  | {
      readonly result: "no-op" | "success";
      readonly message: string;
    }
  | {
      readonly result: "error";
      readonly message: string;
      readonly error: CliError;
    };

export type Readiness =
  | { readonly status: "ready"; readonly message: Option.Option<string> }
  | { readonly status: "skip"; readonly message: string }
  | { readonly status: "warn"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export interface PlannedJobStep<TOperation> {
  readonly _tag: "PlannedJobStep";
  readonly operation: TOperation;
  readonly readiness: Readiness;
  readonly label: string;
}

export interface JobStepResult<TOperation> {
  readonly _tag: "JobStepResult";
  readonly operation: TOperation;
  readonly result: OperationResult;
  readonly label: string;
}

export type JobStep<TOperation> = PlannedJobStep<TOperation> | JobStepResult<TOperation>;

export interface Job<TOperation> {
  readonly steps: ReadonlyArray<JobStep<TOperation>>;
  readonly concurrency: "unbounded" | 1;
}

export interface Plan<TOperation> {
  readonly name: string;
  readonly description: Option.Option<string>;
  readonly jobs: ReadonlyArray<Job<TOperation>>;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Construct a PlannedJobStep — ready when `isReady` is true, skip otherwise.
 */
export const makeStep = <TOperation>(
  operation: TOperation,
  label: string,
  isReady: boolean,
  skipMessage: string,
): PlannedJobStep<TOperation> => ({
  _tag: "PlannedJobStep",
  operation,
  readiness: isReady
    ? { status: "ready", message: Option.none() }
    : { status: "skip", message: skipMessage },
  label,
});
