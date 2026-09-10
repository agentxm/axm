/**
 * Shared helpers for workspace-configuration internal tests: a structural
 * failure-to-step conversion and a minimal on-disk workspace writer for
 * transaction tests against temporary directories.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { StepFailure } from "@agentxm/workspace-operations";
import { WorkspaceConfigurationFailed } from "./errors.js";

/** Render a failure as the sentence the structural test adapter reports. */
export const describeTestFailure = (failure: unknown): string => {
  if (failure instanceof WorkspaceConfigurationFailed) return failure.detail;
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeTestFailure(failure.cause);
    }
  }
  return String(failure);
};

/**
 * Structural stand-in for the application's failure conversion: the feature's
 * own failure maps 1:1; anything else keeps its detail sentence under an
 * `internal` category. Assertions in this package bind to this mapping, not
 * to the application boundary's wording.
 */
export const testToStepFailure = (failure: unknown): StepFailure =>
  failure instanceof StepFailure
    ? failure
    : failure instanceof WorkspaceConfigurationFailed
      ? new StepFailure({
          category: failure.category,
          detail: failure.detail,
          ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
          ...(failure.cause === undefined ? {} : { cause: failure.cause }),
        })
      : new StepFailure({
          category: "internal",
          detail: describeTestFailure(failure),
          cause: failure,
        });

/** Write the minimal settings and lockfile a project workspace needs on disk. */
export const writeMinimalWorkspace = (root: string, agents: ReadonlyArray<string>): void => {
  fs.mkdirSync(path.join(root, ".axm"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "axm.json"),
    JSON.stringify({ agents: [...agents], owner: "@acme" }),
  );
  fs.writeFileSync(path.join(root, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
};
