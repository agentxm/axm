import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { resolveRequestToken } from "./token-resolution.js";
import {
  authCredentialFile,
  authRegistry,
  makeAuthPorts,
  otherAuthRegistry,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/credentials-stay-with-their-registry",
  title: "Credentials stay within their Registry origin",
  statement:
    "When authenticating a Registry request, AXM shall use ambient tokens only for the configured Registry origin and otherwise use credentials saved for the request origin or send no credential.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/token-resolution.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Registry credential isolation", () => {
  it.effect("does not send the configured Registry token to a different origin", () => {
    const { layer } = makeAuthPorts({
      credentials: authCredentialFile,
      environment: { AXM_TOKEN: "fixture-environment-token" },
    });
    return Effect.gen(function* () {
      const selected = yield* resolveRequestToken(`${authRegistry}/v1/extensions`, authRegistry);
      expect(Option.getOrThrow(selected).token).toBe("fixture-environment-token");

      const other = yield* resolveRequestToken(`${otherAuthRegistry}/v1/extensions`, authRegistry);
      expect(Option.getOrThrow(other).token).toBe("fixture-other-access");

      for (const origin of [
        "https://unconfigured.example.test",
        "http://registry.example.test",
        "https://registry.example.test:444",
      ]) {
        expect(
          Option.isNone(yield* resolveRequestToken(`${origin}/v1/extensions`, authRegistry)),
        ).toBe(true);
      }
    }).pipe(Effect.provide(layer));
  });
});
