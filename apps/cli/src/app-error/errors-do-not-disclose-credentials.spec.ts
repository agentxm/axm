import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { REDACTED_SECRET, RegistryProblem, redactRegistryText } from "@agentxm/registry-client";
import { PublishFailed, publishCause } from "@agentxm/workspace-features/publishing";
import { StepFailure, makeOperationResolution } from "@agentxm/workspace-kernel/operations";
import { GitOperationFailed } from "@agentxm/workspace-kernel/sources";

import { initialProgress, reduceProgress } from "../screen/progress.js";
import { AppError } from "./app-error.js";
import { classifyError } from "../cli-runtime/index.js";
import { toPlanResolutionResult } from "../operation-output.js";
import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/errors-do-not-disclose-credentials",
  title: "Error reports keep credentials out of diagnostic details",
  statement:
    "AXM shall redact credential values, including an exact credential the Registry echoed under a sensitive key and an AgentXM session, refresh, personal access, or workload token wherever it appears, from error reports and their diagnostic details in human and machine output at every supported verbosity level, from the plan result document, from the publish result's cause including a Git reason it reports, and from the failure detail a resolved unit publishes on the lifecycle event stream.",
  class: "quality",
  characteristic: "security",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "apps/cli/help/topics/machine-output.md",
    "apps/cli/src/cli-runtime/handle-error.test.ts",
    "apps/cli/src/cli-runtime/json-envelope.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The lifecycle-event example drives the projector and the redaction the producer applies. That every producer applies it before publishing is witnessed by `cli/long-running-operations-emit-lifecycle-events`.",
      retirementCondition:
        "Bind producer evidence here if a producer ever publishes a failure detail the shared redaction has not seen.",
    },
    {
      limitation:
        "These examples exercise production error construction and channel rendering with supplied verbosity settings; they do not establish every command-specific diagnostic producer or global flag combination.",
      retirementCondition:
        "Bind process evidence for global verbosity selection and review diagnostic producers for values that bypass the shared error boundary.",
    },
  ],
});

const levels = [
  { name: "normal", verbose: false, debug: false },
  { name: "verbose", verbose: true, debug: false },
  { name: "debug", verbose: true, debug: true },
] as const;

describe("Credential-safe error reports", () => {
  it("redacts a credential in the failure detail a resolved unit publishes", () => {
    const state = reduceProgress(initialProgress, {
      _tag: "UnitResolved",
      seq: 4,
      atMs: 1_000,
      unitId: "skill:code-review",
      label: "code-review",
      state: "failed",
      index: 0,
      // The producer redacts before it publishes; the projector keeps what it
      // was given, so what a live row can show is what arrived.
      failure: {
        category: "auth",
        detail: redactRegistryText("The registry refused Bearer sk_live_not_a_real_secret_value."),
      },
    });
    const detail = state.units[0]?.failure?.detail ?? "";
    expect(detail).not.toContain("sk_live_not_a_real_secret_value");
    expect(detail).toContain(REDACTED_SECRET);
  });

  // A credential the Registry returned under a sensitive key and then quoted
  // back in its own sentence: no shape identifies it, only the harvested value.
  const echoed = "plainwordsonly";
  const echoedResponse = {
    status: 401,
    body: { credential: echoed, detail: `Credential ${echoed} was revoked.` },
  } as const;

  it("redacts an echoed credential from the plan result document at every level", () => {
    const failure = new StepFailure({
      category: "auth",
      title: `Credential ${echoed} refused`,
      detail: `Credential ${echoed} was revoked.`,
      metadata: { response: echoedResponse },
      cause: new Error(`Registry said: ${echoed}`),
    });
    const resolution = makeOperationResolution({
      name: "Install extensions",
      description: Option.none(),
      mode: "apply",
      atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
      units: [
        {
          id: "skill:review",
          label: "review",
          state: "failed",
          message: `review did not install: Credential ${echoed} was revoked.`,
          error: failure,
        },
      ],
      failure,
    });
    for (const level of levels) {
      const document = JSON.stringify(toPlanResolutionResult(resolution, level));
      expect(document).not.toContain(echoed);
      expect(document).toContain(REDACTED_SECRET);
    }
  });

  it("redacts an echoed credential from the publish result's cause", () => {
    const cause = publishCause(
      new RegistryProblem({
        category: "auth",
        detail: `Credential ${echoed} was revoked.`,
        metadata: { response: echoedResponse },
        cause: undefined,
      }),
    );
    expect(JSON.stringify(cause)).not.toContain(echoed);
    expect(cause.message).toBe(`Credential ${REDACTED_SECRET} was revoked.`);
  });

  const gitCredential = "DISPOSABLE_GIT_CREDENTIAL";
  const gitReason = (url: string) =>
    `Failed to compare 'skills/review' with Git HEAD: fatal: unable to access '${url}': bad object HEAD`;
  const gitAssessmentFailure = new PublishFailed({
    category: "internal",
    detail: `Could not assess the published source state for @acme/skills/review. ${gitReason(
      `https://robot:${gitCredential}@example.test/repo.git`,
    )}`,
    cause: new GitOperationFailed({
      operation: "compare-directory-to-head",
      detail: gitReason(`https://robot:${gitCredential}@example.test/repo.git`),
      cause: new Error(
        `fatal: unable to access 'https://robot:${gitCredential}@example.test/repo.git': bad object HEAD`,
      ),
    }),
  });

  it("redacts URL userinfo from a Git reason in the publish result's cause", () => {
    const cause = publishCause(gitAssessmentFailure);
    expect(JSON.stringify(cause)).not.toContain(gitCredential);
    expect(cause.message).toBe(
      `Could not assess the published source state for @acme/skills/review. ${gitReason(
        `https://robot:${REDACTED_SECRET}@example.test/repo.git`,
      )}`,
    );
  });

  for (const format of ["text", "json"] as const) {
    for (const level of levels) {
      it(`${format} ${level.name} Git assessment failures keep the reason without the credential`, () => {
        const rendered = JSON.stringify(classifyError(gitAssessmentFailure, format, level));
        expect(rendered).not.toContain(gitCredential);
        expect(rendered).toContain("bad object HEAD");
      });
    }
  }

  for (const format of ["text", "json"] as const) {
    it(`${format} diagnostics redact proofs embedded in a JSON response string`, () => {
      const proof = "DISPOSABLE_INITIATOR_PROOF_ENCODED";
      const error = new AppError({
        code: "internal",
        title: "Request failed",
        detail: "Invalid authorization response",
        cause: undefined,
        metadata: {
          response: {
            status: 400,
            body: JSON.stringify({
              initiator_proof: proof,
              code_verifier: proof,
              device_code: proof,
            }),
          },
        },
      });
      expect(
        JSON.stringify(classifyError(error, format, { verbose: true, debug: true })),
      ).not.toContain(proof);
    });
  }

  for (const format of ["text", "json"] as const) {
    for (const level of levels) {
      it(`${format} ${level.name} errors redact AgentXM tokens quoted outside any sensitive key`, () => {
        const credentials = ["axms_", "axmr_", "axmt_", "axmw_"].map(
          (prefix) => `${prefix}${"k".repeat(30)}${"c".repeat(6)}`,
        );
        const [session = "", refresh = "", personal = "", workload = ""] = credentials;
        const cause = new Error(`Exchange answered ${workload}`);
        cause.stack = `Error: Exchange answered ${workload}\n at diagnostic ${refresh}`;
        const error = new AppError({
          code: "auth_required",
          title: "Authentication Required",
          detail: `The Registry refused ${personal}`,
          cause,
          metadata: {
            response: { status: 401, body: { message: `Session ${session} ended` } },
          },
          suggestions: [{ description: `Replace ${workload}` }],
        });
        const rendered = JSON.stringify(classifyError(error, format, level));
        for (const credential of credentials) expect(rendered).not.toContain(credential);
        expect(rendered).toContain("The Registry refused");
      });

      it(`${format} ${level.name} errors redact credentials while retaining useful context`, () => {
        const token = "DISPOSABLE_ERROR_CREDENTIAL_A";
        const password = "DISPOSABLE_ERROR_CREDENTIAL_B";
        const proof = "DISPOSABLE_INITIATOR_PROOF_C";
        const cause = new Error(`Provider rejected ${token}`);
        cause.stack = `Error: Provider rejected ${token}\n at diagnostic ${password}`;
        const error = new AppError({
          code: "internal",
          title: "Request failed",
          detail: `The Registry rejected credential ${token}`,
          cause,
          metadata: {
            request: { service: "registry", url: `https://registry.test/packages?token=${token}` },
            response: {
              status: 500,
              body: {
                token,
                password,
                initiator_proof: proof,
                code_verifier: proof,
                device_code: proof,
                message: `Rejected ${token}`,
              },
            },
          },
          suggestions: [
            {
              description: `Retry after replacing ${password}`,
              url: `https://registry.test/retry?code=${token}`,
            },
          ],
        });
        const classified = classifyError(error, format, level);
        const rendered = JSON.stringify(classified);
        for (const credential of [token, password, proof])
          expect(rendered).not.toContain(credential);
        expect(rendered).toContain("[REDACTED]");
        expect(rendered).toContain("The Registry rejected credential");
        expect(rendered).toContain("Retry after replacing");
        expect(classified.exitCode).not.toBe(0);
      });
    }
  }
});
