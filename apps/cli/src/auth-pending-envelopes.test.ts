/**
 * Exit codes and rendered JSON envelope for the human-handoff failure
 * registry-access raises — a pending step-up verification — plus the terminal
 * categories its resume path reports.
 *
 * The capability's own specification asserts the typed outcome
 * (cli/unattended-verification-is-resumable). This file pins the boundary
 * mapping that specification names in its limitations.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import {
  RegistryAccessFailed,
  StepUpVerificationPending,
} from "@agentxm/registry-access/authentication";
import type { HumanHandoffAction } from "@agentxm/registry-protocol/unstable/human-handoff";

import { failureToAppError } from "./app-error/conversions.js";
import { classifyError, JsonErrorEnvelopeSchema } from "./cli-runtime/index.js";

const registryUrl = "https://registry.example.test";
const stepUpRequestRef = `${registryUrl}/v1/auth/step-up/requests/step_fixture`;

const stepUpAction: HumanHandoffAction = {
  kind: "open-url",
  purpose: "step-up",
  requestRef: stepUpRequestRef,
  registryUrl,
  url: "https://agentxm.ai/step-up/step_fixture",
  expiresAt: "2099-01-01T00:00:00.000Z",
  intervalSeconds: 2,
  resume: `Rerun the same command with the same inputs and --step-up-request ${stepUpRequestRef}.`,
};

const classify = (failure: unknown) => classifyError(failureToAppError(failure), "json");

describe("human-handoff exit codes and envelope", () => {
  it("exits 13 for a pending step-up verification and renders the open-url action", () => {
    const classified = classify(
      new StepUpVerificationPending({ action: stepUpAction, timedOut: false }),
    );
    expect(classified.exitCode).toBe(13);
    const document = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(
      JSON.parse(classified.stdout ?? "null"),
    );
    expect(document).toMatchObject({
      ok: false,
      status: "pending-human",
      blockedOn: "human",
      action: {
        purpose: "step-up",
        requestRef: stepUpRequestRef,
        registryUrl,
        intervalSeconds: 2,
        resume: stepUpAction.resume,
      },
    });
  });

  it("exits 16 when the bounded verification wait elapses", () => {
    expect(
      classify(new StepUpVerificationPending({ action: stepUpAction, timedOut: true })).exitCode,
    ).toBe(16);
  });

  for (const [category, exitCode] of [
    ["auth_expired", 14],
    ["auth_denied", 15],
    ["conflict", 6],
  ] as const) {
    it(`exits ${exitCode} for a ${category} resume outcome`, () => {
      expect(
        classify(new RegistryAccessFailed({ category, detail: "Fixture resume outcome" })).exitCode,
      ).toBe(exitCode);
    });
  }
});
