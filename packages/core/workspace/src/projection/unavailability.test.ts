import { describe, expect, it } from "@effect/vitest";
import {
  makeUnavailableProjectionFact,
  projectionUnavailabilityReason,
} from "./invariant-facts.js";
import {
  DesiredStateIncomplete,
  isProjectionError,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionParticipantFailed,
} from "./errors.js";
import { projectionErrorToStepFailure } from "../materialization/projection-step-failure.js";

const unavailable = (failure: Parameters<typeof projectionUnavailabilityReason>[0]) =>
  makeUnavailableProjectionFact({
    unitId: "rule:instructions-region",
    path: "AGENTS.md",
    scope: "project",
    expectedContributors: [],
    failure,
  }).observation;

describe("projection unavailability", () => {
  it("reads an unsupported marker version from the failure, not its wording", () => {
    const failure = new ManagedRegionViolation({
      displayPath: "AGENTS.md",
      reason: "AXM ownership marker version 2 is unsupported",
      reasonCode: "managed-region-unsupported-version",
    });
    expect(projectionUnavailabilityReason(failure)).toBe("unsupported-version");
    // The fact's sentence is the kernel's rendering, which names the file.
    expect(unavailable(failure).message).toBe(projectionErrorToStepFailure(failure).detail);
    expect(unavailable(failure).message).toBe(
      "AXM cannot safely update its section in AGENTS.md: AXM ownership marker version 2 is unsupported",
    );
  });

  it("treats a malformed region as invalid ownership rather than unsupported", () => {
    expect(
      projectionUnavailabilityReason(
        new ManagedRegionViolation({
          displayPath: "AGENTS.md",
          reason: "AXM region marker has an invalid or missing region",
          reasonCode: "managed-region-malformed",
        }),
      ),
    ).toBe("invalid-ownership");
  });

  it("reports every other projection failure as unavailable, worded by the kernel", () => {
    expect(
      projectionUnavailabilityReason(
        new DesiredStateIncomplete({ problems: "pack alpha is unreachable" }),
      ),
    ).toBe("unavailable");
    const io = new ProjectionIoFailed({ path: "/w/AGENTS.md", step: "read", cause: "EACCES" });
    expect(unavailable(io).message).toBe(projectionErrorToStepFailure(io).detail);
    expect(unavailable(io).message).toContain("/w/AGENTS.md");
  });

  it("carries a participant's own sentence without rendering it", () => {
    const observation = unavailable(
      new ProjectionParticipantFailed({
        unitId: "hook:agent-hook-entries",
        detail: "The owner of hook:agent-hook-entries could not project it (HookConfigInvalid).",
      }),
    );
    expect(observation.reasonCode).toBe("unavailable");
    expect(observation.message).toBe(
      "The owner of hook:agent-hook-entries could not project it (HookConfigInvalid).",
    );
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
