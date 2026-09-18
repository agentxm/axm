import { describe, expect, it } from "@effect/vitest";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ForbiddenErrorEncoded } from "./__generated__/registry-client.js";
import { registryErrorToProblem } from "./translate.js";

export const specification = defineSpecification({
  requirement: "cli/denials/only-being-signed-out-suggests-signing-in",
  title: "A refusal a signed-in person can hit never suggests signing in",
  statement:
    "When the Registry forbids an operation, AXM shall render the refusal from its wire code, offer at most one recovery, fall back to the Registry's own title and detail for a code it carries no recovery for, and never suggest signing in.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/supporting/registry-client/src/translate.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Every forbidding rule the Registry can name on the wire. */
const FORBIDDEN_CODES = ForbiddenErrorEncoded.fields.code.literals;

const forbidden = (code: string) =>
  registryErrorToProblem(
    {
      kind: "ForbiddenError",
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      detail: `The Registry refused this: ${code}.`,
      code,
    },
    HttpClientResponse.fromWeb(
      HttpClientRequest.get("https://registry.example.test/v1/extensions/@alice"),
      new Response(null, { status: 403 }),
    ),
  );

describe("Forbidding rules render by code", () => {
  it("offers at most one recovery for every code, and never a sign-in", () => {
    expect(FORBIDDEN_CODES.length).toBeGreaterThan(0);
    for (const code of FORBIDDEN_CODES) {
      const problem = forbidden(code);
      // A quota that is exhausted is its own category; every other forbidding
      // rule is a permission answer.
      expect(problem.category, code).toBe(
        code === "publish/quota-exceeded" ? "quota" : "forbidden",
      );
      expect((problem.suggestions ?? []).length, code).toBeLessThanOrEqual(1);
      expect(JSON.stringify(problem.suggestions ?? []), code).not.toContain("axm login");
    }
  });

  it("keeps the Registry's own words for a code it carries no recovery for", () => {
    // An unknown code is the same case as a known one with nothing useful to
    // add: the Registry already said why, so nothing is invented over it.
    const problem = forbidden("a_rule_this_client_has_never_heard_of");
    expect(problem.title).toBe("Forbidden");
    expect(problem.detail).toBe(
      "The Registry refused this: a_rule_this_client_has_never_heard_of.",
    );
    expect(problem.suggestions).toBeUndefined();
  });
});
