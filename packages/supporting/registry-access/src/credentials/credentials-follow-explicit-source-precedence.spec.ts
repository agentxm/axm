import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { defineSpecification } from "@agentxm/specification-metadata";

import { currentToken } from "../authentication/identity.js";
import {
  authCredentialFile,
  authFailureDetail,
  authRegistry,
  makeAuthPorts,
} from "../authentication/test-support/test-helpers.js";
import { WorkloadTokenSource } from "./schema.js";

export const specification = defineSpecification({
  requirement: "cli/credentials-follow-explicit-source-precedence",
  title: "Explicit token sources take precedence over saved sessions",
  statement:
    "For commands using the selected Registry, AXM shall use a nonempty AXM_TOKEN before AXM_TOKEN_FILE, a valid token file before a GitHub Actions identity, and a GitHub Actions identity before saved Registry credentials, refusing an unreadable or empty selected token file instead of silently using another source. A GitHub Actions identity is offered when both ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are nonempty and AXM_TRUSTED_PUBLISHING is not 0.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/credentials/token-resolution.ts",
    "apps/cli/help/topics/environment.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** The environment GitHub Actions gives a job granted `permissions: id-token: write`. */
const githubActions = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example.test/token?api-version=2.0",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-request-token",
};

/** A workload source that exchanges any identity for one fixed token. */
const workload = {
  tokenFor: (_identity: unknown, registryOrigin: string) =>
    Effect.succeed(
      new WorkloadTokenSource({
        token: "fixture-workload-token",
        expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
        registryUrl: registryOrigin,
      }),
    ),
};

const sources = [
  "environment",
  "file",
  "github-actions",
  "github-actions-opted-out",
  "github-actions-incomplete",
  "saved",
  "empty-file",
  "missing-file",
] as const;

const expected: Record<(typeof sources)[number], string> = {
  environment: "fixture-environment-token",
  file: "fixture-file-token",
  "github-actions": "fixture-workload-token",
  "github-actions-opted-out": "fixture-stored-access",
  "github-actions-incomplete": "fixture-stored-access",
  saved: "fixture-stored-access",
  "empty-file": "",
  "missing-file": "",
};

const environmentFor = (
  source: (typeof sources)[number],
  tokenPath: string,
): Record<string, string> => {
  switch (source) {
    case "environment":
      // Every lower source is offered too; the environment token still wins.
      return {
        AXM_TOKEN: "fixture-environment-token",
        AXM_TOKEN_FILE: tokenPath,
        ...githubActions,
      };
    case "file":
    case "empty-file":
    case "missing-file":
      return { AXM_TOKEN_FILE: tokenPath, ...githubActions };
    case "github-actions":
      return githubActions;
    case "github-actions-opted-out":
      return { ...githubActions, AXM_TRUSTED_PUBLISHING: "0" };
    case "github-actions-incomplete":
      return { ACTIONS_ID_TOKEN_REQUEST_URL: githubActions.ACTIONS_ID_TOKEN_REQUEST_URL };
    case "saved":
      return {};
  }
};

describe("Credential selection", () => {
  for (const source of sources) {
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
          environment: environmentFor(source, tokenPath),
          workload,
        });

        yield* Effect.gen(function* () {
          if (source === "empty-file" || source === "missing-file") {
            const failure = yield* currentToken(authRegistry).pipe(Effect.flip);
            expect(authFailureDetail(failure)).toContain("AXM_TOKEN_FILE");
          } else {
            expect(yield* currentToken(authRegistry)).toBe(expected[source]);
          }
        }).pipe(Effect.provide(Layer.mergeAll(layer, NodeServices.layer)));
      }),
    );
  }
});
