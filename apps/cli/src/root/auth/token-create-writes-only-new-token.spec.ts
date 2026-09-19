import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  ISSUED_TOKEN_ID,
  ISSUED_TOKEN_SECRET,
  makeTokenSpecContext,
} from "../../test-support/token-harness.js";
import { handleCreateToken } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/create/raw-output-writes-only-new-token",
  title: "Raw token creation hands a pipe only the new secret",
  statement:
    "When axm token create is run with raw token output, AXM shall write only the new token followed by one newline to stdout, once, and shall report the token's ID, name, permissions, and expiry on stderr without the secret.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/token.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Raw token creation", () => {
  it.effect("writes one framed secret and describes it on stderr", () => {
    const context = makeTokenSpecContext();
    return Effect.gen(function* () {
      yield* handleCreateToken({
        name: "ci",
        expires: "30d",
        owners: [],
        extensions: [],
        permission: "read",
        output: "token",
      });

      expect(context.creations).toEqual(["ci"]);
      expect(context.state.credentials).toEqual([`${ISSUED_TOKEN_SECRET}\n`]);
      expect(context.state.results).toEqual([]);
      expect(context.state.docs.filter((entry) => entry.channel === "stdout")).toEqual([]);

      const stderr = context.stderr();
      expect(stderr).toContain(ISSUED_TOKEN_ID);
      expect(stderr).toContain('\\"ci\\"');
      expect(stderr).toContain("Read extensions");
      expect(stderr).toContain("2026-06-14T00:00:00.000Z");
      expect(stderr).not.toContain(ISSUED_TOKEN_SECRET);
      expect(context.revocations).toEqual([]);
    }).pipe(Effect.provide(context.layer));
  });
});
