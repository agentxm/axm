import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { afterEach, vi } from "vitest";
import { resolveRequestToken } from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authRegistry,
  otherAuthRegistry,
  makeAuthSpecContext,
} from "../support/auth-harness.js";
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/credentials-stay-with-their-registry",
  title: "Credentials stay within their Registry origin",
  statement:
    "When authenticating a Registry request, AXM shall use ambient tokens only for the configured Registry origin and otherwise use credentials saved for the request origin or send no credential.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["example"],
  derivedFrom: ["packages/registry-auth/src/token-resolution.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Registry credential isolation", () => {
  it.effect("does not send the configured Registry token to a different origin", () => {
    vi.stubEnv("AXM_TOKEN", "fixture-environment-token");
    vi.stubEnv("AXM_TOKEN_FILE", "");
    const context = makeAuthSpecContext({ credentials: authCredentialFile });
    return context.provide(
      Effect.gen(function* () {
        const selected = yield* resolveRequestToken(`${authRegistry}/v1/extensions`, authRegistry);
        expect(Option.getOrThrow(selected).token).toBe("fixture-environment-token");
        const other = yield* resolveRequestToken(
          `${otherAuthRegistry}/v1/extensions`,
          authRegistry,
        );
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
      }),
    );
  });
});
