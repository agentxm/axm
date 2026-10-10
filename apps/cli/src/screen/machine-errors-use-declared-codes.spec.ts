import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { OPERATION_ERROR_CATEGORIES } from "@agentxm/workspace-kernel/operations";
import { ErrorEventCodeSchema, ErrorEventSchema, encodeMachineEvent, errorEvent } from "./index.js";

export const specification = defineSpecification({
  requirement: "cli/machine-errors-use-declared-codes",
  title: "Machine error events use shared error codes and explicit interruption signals",
  statement:
    "Every stderr error event shall carry type error, a message, and a code from the shared ErrorCode vocabulary or interrupted, with signal present if and only if the code is interrupted, limited to SIGINT or SIGTERM, and without a reason field.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "decision-table"],
  derivedFrom: ["cli/machine-errors-use-the-stable-envelope"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decode = Schema.decodeUnknownSync(ErrorEventSchema);

describe("Machine error event vocabulary", () => {
  it.each(OPERATION_ERROR_CATEGORIES)("renders %s without interruption fields", (code) => {
    const event = errorEvent(code, "An explicit message");
    expect(decode(JSON.parse(encodeMachineEvent(event)))).toEqual({
      type: "error",
      code,
      message: "An explicit message",
    });
    expect(event).not.toHaveProperty("reason");
    expect(event).not.toHaveProperty("signal");
  });

  it.each(["SIGINT", "SIGTERM"] as const)("renders interrupted with %s", (signal) => {
    expect(decode(errorEvent("interrupted", "Stopped", { signal }))).toEqual({
      type: "error",
      code: "interrupted",
      message: "Stopped",
      signal,
    });
  });

  it.each([
    { type: "error", code: "arbitrary", message: "Invalid" },
    { type: "error", code: "interrupted", message: "Invalid" },
    { type: "error", code: "interrupted", message: "Invalid", signal: "SIGKILL" },
    { type: "error", code: "usage", message: "Invalid", signal: "SIGINT" },
  ])("rejects an undeclared code or signal combination: $code / $signal", (event) => {
    expect(() => decode(event)).toThrow();
  });

  it("publishes the shared codes plus only the stderr interruption code", () => {
    const decodeCode = Schema.decodeUnknownSync(ErrorEventCodeSchema);
    for (const code of [...OPERATION_ERROR_CATEGORIES, "interrupted"])
      expect(decodeCode(code)).toBe(code);
    expect(() => decodeCode("SIGINT")).toThrow();
    expect(() => decodeCode("arbitrary")).toThrow();
  });
});
