import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { LintJsonDocumentSchema } from "./json-schema.js";

describe("lint JSON contract", () => {
  const document = {
    input: { view: "workspace" as const },
    findings: [
      {
        group: "workspace" as const,
        kind: "advisory" as const,
        ruleId: "workspace/example-valid",
        severity: "error" as const,
        message: "Observed state differs.",
        displayRoot: ".",
        path: "axm.json",
        subject: "axm.json",
        authority: "axm.json",
        observed: "Observed state differs.",
        expected: "Example state is valid.",
      },
    ],
    summary: { total: 1, errors: 1, warnings: 0, infos: 0, exitCategory: "errors" as const },
    driftBanner: [],
  };

  it("accepts fact fields and contains no recovery metadata", () => {
    const decoded = Schema.decodeUnknownSync(LintJsonDocumentSchema)(document, {
      onExcessProperty: "error",
    });
    expect(decoded.findings[0]?.observed).toBe("Observed state differs.");
    expect("suggestions" in (decoded.findings[0] ?? {})).toBe(false);
  });

  it("rejects suggested-action metadata", () => {
    expect(() =>
      Schema.decodeUnknownSync(LintJsonDocumentSchema)(
        { ...document, findings: [{ ...document.findings[0], suggestions: [] }] },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });
});
