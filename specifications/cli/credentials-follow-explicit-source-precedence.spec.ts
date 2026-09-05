import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, vi } from "vitest";
import { handleToken, getAppError } from "axm.sh/specification-harness";
import { authCredentialFile, makeAuthSpecContext } from "../support/auth-harness.js";
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/credentials-follow-explicit-source-precedence",
  title: "Explicit token sources take precedence over saved sessions",
  statement:
    "For commands using the selected Registry, AXM shall use a nonempty AXM_TOKEN before AXM_TOKEN_FILE and a valid token file before saved Registry credentials, refusing an unreadable or empty selected token file instead of silently using a saved session.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/registry-auth/src/token-resolution.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Credential selection", () => {
  for (const source of ["environment", "file", "saved", "empty-file", "missing-file"] as const) {
    it.effect(source, () =>
      Effect.gen(function* () {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-token-source-spec-"));
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => fs.rmSync(directory, { recursive: true, force: true })),
        );
        const tokenPath = path.join(directory, "token");
        if (source !== "missing-file")
          fs.writeFileSync(tokenPath, source === "empty-file" ? "  \n" : "  fixture-file-token\n");
        vi.stubEnv("AXM_TOKEN", source === "environment" ? "fixture-environment-token" : "");
        vi.stubEnv("AXM_TOKEN_FILE", source === "saved" ? "" : tokenPath);
        const context = makeAuthSpecContext({ credentials: authCredentialFile });
        yield* Effect.gen(function* () {
          if (source === "empty-file" || source === "missing-file") {
            const failure = yield* handleToken().pipe(Effect.flip);
            expect(getAppError(failure).detail).toContain("AXM_TOKEN_FILE");
            expect(context.rendererState.results).toEqual([]);
          } else {
            yield* handleToken();
            const expected =
              source === "environment"
                ? "fixture-environment-token"
                : source === "file"
                  ? "fixture-file-token"
                  : "fixture-stored-access";
            expect(context.rendererState.results).toHaveLength(1);
            expect(context.rendererState.results[0]?.data).toEqual({ data: { token: expected } });
          }
        }).pipe(Effect.provide(Layer.mergeAll(context.layer, NodeServices.layer)));
      }),
    );
  }
});
