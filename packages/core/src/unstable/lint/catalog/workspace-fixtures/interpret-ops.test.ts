/**
 * Totality guard for the fixture interpreter.
 *
 * The determinism harness applies autofix Operations to a `WorkspaceState`
 * double and re-runs the rule's check. An operation the reducer ignores makes
 * that harness report a fix as converged without having applied it, so every
 * name in the canonical vocabulary must either mutate state or say plainly that
 * its arm is missing. Falling through to the `unknown operation` arm would
 * instead claim a rule emitted a name it is not allowed to emit.
 */

import { describe, expect, it } from "vitest";

import { PER_EXTENSION_OPERATION_NAMES } from "../workspace/helpers/install-ops.js";
import { applyOperationIntent, emptyWorkspaceState } from "./interpret-ops.js";

/** Applying an op to an untouched state: what the reducer did about it. */
type Outcome = "mutated" | "unimplemented" | "unknown";

const outcomeFor = (name: string): Outcome => {
  const state = emptyWorkspaceState();

  try {
    applyOperationIntent(state, { name, args: {} });
    return "mutated";
  } catch (error) {
    return error instanceof Error && error.message.includes("unknown operation")
      ? "unknown"
      : "unimplemented";
  }
};

describe("applyOperationIntent", () => {
  it.each(PER_EXTENSION_OPERATION_NAMES)(
    "does not treat the vocabulary member %s as an unknown operation",
    (name) => {
      expect(outcomeFor(name)).not.toBe("unknown");
    },
  );

  it("reports a name outside the vocabulary as unknown", () => {
    expect(outcomeFor("not-a-real-operation")).toBe("unknown");
  });
});
