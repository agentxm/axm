import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  RegistryProblem,
  RegistryRequestFailed,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import { defineSpecification } from "@agentxm/specification-metadata";

import { authCredentialFile, authRegistry, makeAuthPorts } from "../test-support/test-helpers.js";
import { createToken } from "../tokens.js";

export const specification = defineSpecification({
  requirement: "cli/token/create/reports-uncertain-issuance",
  title: "A creation the Registry did not refuse is reported as possibly issued",
  statement:
    "When a token creation request ends without a definitive Registry refusal — no answer, an unreadable answer, or a gateway or server error — AXM shall report that the token may have been created, direct review of the token inventory and revocation by ID, and shall not resubmit the creation or start another approval; a client-error refusal shall keep the Registry's own explanation.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/tokens.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const request = {
  name: "automation",
  expires: "7d",
  owners: [],
  extensions: ["@alice/skills/review"],
  permission: "publish",
  verification: { unattended: true },
} as const;

const answered = (status: number, category: RegistryProblem["category"]) =>
  new RegistryProblem({
    category,
    detail: "The Registry said so.",
    metadata: { response: { status } },
    cause: undefined,
  });

/** Submit one creation that fails as given, and report the failure and the submission count. */
const createFailingWith = (failure: RegistryClientFailure) => {
  let submissions = 0;
  const { layer } = makeAuthPorts({
    credentials: authCredentialFile,
    auth: {
      createToken: () =>
        Effect.suspend(() => {
          submissions += 1;
          return Effect.fail(failure);
        }),
    },
  });
  return createToken(request, authRegistry).pipe(
    Effect.flip,
    Effect.map((reported) => ({ reported, submissions })),
    Effect.provide(layer),
  );
};

describe("Uncertain token issuance", () => {
  const uncertain: ReadonlyArray<readonly [string, RegistryClientFailure]> = [
    ...(["network", "timeout", "internal"] as const).map(
      (category) =>
        [
          `a ${category} failure`,
          new RegistryRequestFailed({ category, detail: "Could not create token" }),
        ] as const,
    ),
    ["a 504 gateway answer", answered(504, "unavailable")],
    ["a 500 server answer", answered(500, "internal")],
    ["a 408 timeout answer", answered(408, "timeout")],
  ];

  for (const [label, failure] of uncertain) {
    it.effect(`${label} is reported as possibly issued and not retried`, () =>
      Effect.gen(function* () {
        const { reported, submissions } = yield* createFailingWith(failure);

        expect(submissions).toBe(1);
        expect(reported).toMatchObject({
          _tag: failure._tag,
          category: failure.category,
          suggestions: [
            { description: "Review existing tokens", cmd: "axm token list" },
            { description: "Revoke an unwanted token by ID", cmd: "axm token revoke <id>" },
          ],
        });
        expect("detail" in reported ? reported.detail : "").toContain("may or may not exist");
      }),
    );
  }

  const refused: ReadonlyArray<readonly [string, RegistryClientFailure]> = [
    ["a 422 validation answer", answered(422, "validation")],
    ["a 403 forbidden answer", answered(403, "forbidden")],
    [
      "input that never left this process",
      new RegistryRequestFailed({ category: "validation", detail: "Invalid token name." }),
    ],
  ];

  for (const [label, failure] of refused) {
    it.effect(`${label} keeps its own explanation`, () =>
      Effect.gen(function* () {
        const { reported, submissions } = yield* createFailingWith(failure);

        expect(submissions).toBe(1);
        expect(reported).toBe(failure);
      }),
    );
  }
});
