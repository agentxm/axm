import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { defineSpecification } from "@agentxm/specification-metadata";

import { currentToken } from "./identity.js";
import {
  authCredentialFile,
  authFailureDetail,
  authRegistry,
  makeAuthPorts,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/credentials-follow-explicit-source-precedence",
  title: "Explicit token sources take precedence over saved sessions",
  statement:
    "For commands using the selected Registry, AXM shall use a nonempty AXM_TOKEN before AXM_TOKEN_FILE and a valid token file before saved Registry credentials, refusing an unreadable or empty selected token file instead of silently using a saved session.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/token-resolution.ts"],
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

        const { layer } = makeAuthPorts({
          credentials: authCredentialFile,
          environment: {
            ...(source === "environment" ? { AXM_TOKEN: "fixture-environment-token" } : {}),
            ...(source === "saved" ? {} : { AXM_TOKEN_FILE: tokenPath }),
          },
        });

        yield* Effect.gen(function* () {
          if (source === "empty-file" || source === "missing-file") {
            const failure = yield* currentToken(authRegistry).pipe(Effect.flip);
            expect(authFailureDetail(failure)).toContain("AXM_TOKEN_FILE");
          } else {
            expect(yield* currentToken(authRegistry)).toBe(
              source === "environment"
                ? "fixture-environment-token"
                : source === "file"
                  ? "fixture-file-token"
                  : "fixture-stored-access",
            );
          }
        }).pipe(Effect.provide(Layer.mergeAll(layer, NodeServices.layer)));
      }),
    );
  }
});
