import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { registryErrorToProblem } from "@agentxm/registry-client";
import { StepFailureConversion } from "@agentxm/workspace-kernel/reconciliation";
import { defineSpecification } from "@agentxm/specification-metadata";

import { stepFailureToAppError } from "./conversions.js";
import { WorkspaceFailureConversionLive } from "./failure-catalog.js";
import {
  InvocationCredentialSource,
  appErrorForCredentialSource,
} from "./trusted-publisher-recoveries.js";

export const specification = defineSpecification({
  requirement: "cli/trusted-publishing/refusals-name-the-trusted-publishers-permissions",
  title: "A refused workload token points at the trusted publisher's permissions",
  statement:
    "When the invocation's credential for its default Registry comes from a GitHub Actions identity and the Registry forbids an operation for the credential's scope or resource limits or for a publish rule other than an exhausted quota or plan limit, AXM shall recover by pointing at the trusted publisher's permissions on the selected Registry's web surface rather than at a signed-in session, on the command and plan-step paths alike, and shall leave every other refusal and every other credential's refusal as the Registry's own recovery reads.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: ["apps/cli/help/topics/environment.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const TRUSTED_PUBLISHER_RECOVERY = {
  description: "Adjust the trusted publisher's permissions in AgentXM settings.",
  url: "https://agentxm.ai/u/settings/trusted-publishers",
};

const refusal = (code: string, registryUrl: string, details?: Record<string, unknown>) =>
  registryErrorToProblem(
    {
      type: "https://registry.agentxm.ai/v1/problems/forbidden",
      title: "Forbidden",
      status: 403,
      detail: `The Registry refused this: ${code}.`,
      code,
      ...(details === undefined ? {} : { details }),
    },
    HttpClientResponse.fromWeb(
      HttpClientRequest.post(`${registryUrl}/v1/extensions/@alice/skills/a/1.0.0`),
      new Response(null, { status: 403 }),
    ),
  );

/** The recovery a step reads with, and the one the command envelope reads with. */
const rendered = (
  code: string,
  github: boolean,
  registryUrl = "https://registry.agentxm.ai",
  details?: Record<string, unknown>,
) => {
  const source = github ? Option.some("github-actions" as const) : Option.none();
  return Effect.gen(function* () {
    const conversion = yield* StepFailureConversion;
    const step = conversion.toStepFailure(refusal(code, registryUrl, details));
    const command = appErrorForCredentialSource(source, stepFailureToAppError(step));
    return { step: step.suggestions, command: command.suggestions };
  }).pipe(
    Effect.provide(WorkspaceFailureConversionLive),
    Effect.provideService(InvocationCredentialSource, source),
  );
};

describe("Refusals of a trusted publisher's workload token", () => {
  it.effect("points a development Registry refusal at development settings", () =>
    Effect.gen(function* () {
      const result = yield* rendered(
        "publish_insufficient_scope",
        true,
        "https://registry-dev.agentxm.ai",
      );
      const expected = [
        {
          ...TRUSTED_PUBLISHER_RECOVERY,
          url: "https://web-dev.agentxm.ai/u/settings/trusted-publishers",
        },
      ];
      expect(result).toEqual({ step: expected, command: expected });
    }),
  );

  it.effect.each(["publish_plan_limit_reached", "visibility_plan_limit_reached"])(
    "keeps the plan recovery for %s even for a workload token",
    (code) =>
      Effect.gen(function* () {
        const upgradeUrl = "https://web-dev.agentxm.ai/orgs/@example/settings/plan";
        const result = yield* rendered(code, true, "https://registry-dev.agentxm.ai", {
          upgradeUrl,
        });
        const expected = [
          { description: "Open the owner's plan page to raise the limit.", url: upgradeUrl },
        ];
        expect(result).toEqual({ step: expected, command: expected });
      }),
  );

  it.effect.each([
    "insufficient_scope",
    "resource_restriction",
    "publish_insufficient_scope",
    "publish_resource_restriction",
    "publish_handle_not_owned",
    "publish_publish_forbidden",
  ])("%s names the trusted publisher's permissions", (code) =>
    Effect.gen(function* () {
      const github = yield* rendered(code, true);
      expect(github.step).toEqual([TRUSTED_PUBLISHER_RECOVERY]);
      expect(github.command).toEqual([TRUSTED_PUBLISHER_RECOVERY]);

      // Another credential's refusal keeps the Registry's own recovery.
      const other = yield* rendered(code, false);
      expect(other.step ?? []).not.toContainEqual(TRUSTED_PUBLISHER_RECOVERY);
      expect(other.command ?? []).not.toContainEqual(TRUSTED_PUBLISHER_RECOVERY);
    }),
  );

  it.effect.each([
    "publish_quota_exceeded",
    "publish_plan_limit_reached",
    "visibility_plan_limit_reached",
    "credential_not_admitted",
    "identity_suspended",
  ])("%s keeps the Registry's own recovery", (code) =>
    Effect.gen(function* () {
      const github = yield* rendered(code, true);
      const other = yield* rendered(code, false);
      expect(github).toEqual(other);
    }),
  );
});
