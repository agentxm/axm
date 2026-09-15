import { describe, expect, it } from "@effect/vitest";
import { projectionUnavailability } from "./invariant-facts.js";
import {
  DesiredStateIncomplete,
  isProjectionError,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionParticipantFailed,
} from "./errors.js";

describe("projection unavailability", () => {
  it("reads an unsupported marker version from the failure, not its wording", () => {
    const classified = projectionUnavailability(
      new ManagedRegionViolation({
        displayPath: "AGENTS.md",
        reason: "AXM ownership marker version 2 is unsupported",
        reasonCode: "managed-region-unsupported-version",
      }),
    );

    expect(classified.reasonCode).toBe("unsupported-version");
    expect(classified.message).toBe("AXM ownership marker version 2 is unsupported");
  });

  it("treats a malformed region as invalid ownership rather than unsupported", () => {
    expect(
      projectionUnavailability(
        new ManagedRegionViolation({
          displayPath: "AGENTS.md",
          reason: "AXM region marker has an invalid or missing region",
          reasonCode: "managed-region-malformed",
        }),
      ).reasonCode,
    ).toBe("invalid-ownership");
  });

  it("reports every other projection failure as unavailable", () => {
    expect(
      projectionUnavailability(
        new DesiredStateIncomplete({ problems: "pack alpha is unreachable" }),
      ).reasonCode,
    ).toBe("unavailable");
    expect(
      projectionUnavailability(
        new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "read", cause: "EACCES" }),
      ).message,
    ).toContain("/w/AGENTS.md");
  });

  it("carries a participant's own sentence without rendering it", () => {
    expect(
      projectionUnavailability(
        new ProjectionParticipantFailed({
          unitId: "hook:agent-hook-entries",
          detail: "The owner of hook:agent-hook-entries could not project it (HookConfigInvalid).",
        }),
      ),
    ).toEqual({
      reasonCode: "unavailable",
      message: "The owner of hook:agent-hook-entries could not project it (HookConfigInvalid).",
    });
  });

  it("recognises projection's own family so owners pass it through typed", () => {
    expect(isProjectionError(new ProjectionIoFailed({ path: "p", step: "read", cause: 1 }))).toBe(
      true,
    );
    expect(isProjectionError(new ProjectionParticipantFailed({ unitId: "u", detail: "d" }))).toBe(
      false,
    );
  });
});
