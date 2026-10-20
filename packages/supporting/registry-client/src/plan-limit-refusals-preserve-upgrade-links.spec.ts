import { describe, expect, it } from "vitest";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { defineSpecification } from "@agentxm/specification-metadata";
import { registryErrorToProblem } from "./translate.js";

export const specification = defineSpecification({
  requirement: "cli/denials/plan-limit-refusals-preserve-upgrade-links",
  title: "A plan-limit refusal preserves its upgrade link",
  statement:
    "When the Registry refuses publication or a visibility change because a plan limit was reached, AXM shall offer the HTTP or HTTPS upgrade link in that refusal's details as the recovery and shall not turn a missing or invalid URL into a link.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const refusal = (code: string, upgradeUrl: unknown) =>
  registryErrorToProblem(
    {
      kind: "ForbiddenError",
      type: "about:blank",
      title: "Plan limit reached",
      status: 403,
      code,
      detail: "This owner's plan does not allow another private extension.",
      details: { upgradeUrl },
    },
    HttpClientResponse.fromWeb(
      HttpClientRequest.post("https://registry-dev.agentxm.ai/v1/extensions"),
      new Response(null, { status: 403 }),
    ),
  );

describe("Plan-limit recovery", () => {
  it.each(["publish_plan_limit_reached", "visibility_plan_limit_reached"])(
    "preserves the owner's plan link for %s",
    (code) => {
      const upgradeUrl = "https://web-dev.agentxm.ai/orgs/@example/settings/plan";
      expect(refusal(code, upgradeUrl).suggestions).toEqual([
        { description: "Open the owner's plan page to raise the limit.", url: upgradeUrl },
      ]);
    },
  );
  it.each([undefined, null, "invalid", "javascript:alert(1)"])(
    "does not offer an invalid link: %s",
    (upgradeUrl) => {
      expect(refusal("publish_plan_limit_reached", upgradeUrl).suggestions?.[0]).not.toHaveProperty(
        "url",
      );
    },
  );
});
