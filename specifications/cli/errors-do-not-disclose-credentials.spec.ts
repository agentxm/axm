import { describe, expect, it } from "@effect/vitest";
import { AppError, classifyError } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/errors-do-not-disclose-credentials",
  title: "Error reports keep credentials out of diagnostic details",
  statement:
    "AXM shall redact credential values from error reports and their diagnostic details in human and machine output at every supported verbosity level.",
  class: "quality",
  characteristic: "security",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/help/topics/machine-output.md",
    "packages/cli/src/cli-runtime/handle-error.internal.test.ts",
    "packages/cli/src/cli-runtime/json-envelope.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
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
  for (const format of ["text", "json"] as const) {
    for (const level of levels) {
      it(`${format} ${level.name} errors redact credentials while retaining useful context`, () => {
        const token = "DISPOSABLE_ERROR_CREDENTIAL_A";
        const password = "DISPOSABLE_ERROR_CREDENTIAL_B";
        const cause = new Error(`Provider rejected ${token}`);
        cause.stack = `Error: Provider rejected ${token}\n at diagnostic ${password}`;
        const error = new AppError({
          code: "internal",
          title: "Request failed",
          detail: `The Registry rejected credential ${token}`,
          cause,
          metadata: {
            request: { service: "registry", url: `https://registry.test/packages?token=${token}` },
            response: { status: 500, body: { token, password, message: `Rejected ${token}` } },
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
        for (const credential of [token, password]) expect(rendered).not.toContain(credential);
        expect(rendered).toContain("[REDACTED]");
        expect(rendered).toContain("The Registry rejected credential");
        expect(rendered).toContain("Retry after replacing");
        expect(classified.exitCode).not.toBe(0);
      });
    }
  }
});
