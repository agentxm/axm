/**
 * Exit codes and rendered JSON envelope for the two human-handoff failures
 * registry-auth raises: a pending publish authorization and a pending step-up
 * verification, plus the terminal categories their resume paths report.
 *
 * The capability's own specifications assert the typed outcomes
 * (cli/publish/authorization-resumes-the-exact-publication,
 * cli/unattended-verification-is-resumable). This file pins the boundary
 * mapping those specifications name in their limitations.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import {
  PublishAuthorizationPending,
  RegistryAuthFailed,
  StepUpVerificationPending,
} from "@agentxm/registry-auth";
import type { HumanHandoffAction } from "@agentxm/registry-protocol/unstable/human-handoff";

import { authFailureToAppError } from "./feature-errors.js";
import { classifyError, JsonErrorEnvelopeSchema } from "./cli-runtime/index.js";

const registryUrl = "https://registry.example.test";
const publishRequestRef = `${registryUrl}/v1/auth/publish-requests/pubreq_fixture`;
const stepUpRequestRef = `${registryUrl}/v1/auth/step-up/requests/step_fixture`;

const publishAction: HumanHandoffAction = {
  kind: "open-url",
  purpose: "publish",
  requestRef: publishRequestRef,
  registryUrl,
  url: "https://auth.example.test/publish/authorize/pubreq_fixture",
  expiresAt: "2099-01-01T00:00:00.000Z",
  intervalSeconds: 2,
  resume: `Rerun publish with --authorization-request ${publishRequestRef}`,
};

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

const classify = (failure: Parameters<typeof authFailureToAppError>[0]) =>
  classifyError(authFailureToAppError(failure), "json");

describe("human-handoff exit codes and envelope", () => {
  it("exits 13 for a pending publish authorization and renders the open-url action", () => {
    const classified = classify(
      new PublishAuthorizationPending({ action: publishAction, timedOut: false }),
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
        purpose: "publish",
        requestRef: publishRequestRef,
        registryUrl,
        intervalSeconds: 2,
        resume: publishAction.resume,
      },
    });
  });

  it("exits 16 when the bounded publish wait elapses", () => {
    expect(
      classify(new PublishAuthorizationPending({ action: publishAction, timedOut: true })).exitCode,
    ).toBe(16);
  });

  it("exits 13 for a pending step-up verification and renders its action", () => {
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
      action: { purpose: "step-up", requestRef: stepUpRequestRef, resume: stepUpAction.resume },
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
        classify(new RegistryAuthFailed({ category, detail: "Fixture resume outcome" })).exitCode,
      ).toBe(exitCode);
    });
  }
});
