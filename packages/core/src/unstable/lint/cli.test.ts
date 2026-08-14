import { describe, expect, it } from "@effect/vitest";
import { resolveLintExitCategory, toLintJsonDocument } from "./cli.js";

describe("lint fact rendering", () => {
  it("maps a rule predicate to explicit machine-readable facts", () => {
    const document = toLintJsonDocument({
      summary: {
        findings: [
          {
            group: "workspace",
            ruleDescription: "Example state is valid.",
            displayRoot: ".",
            path: ".axm/settings.json",
            finding: {
              kind: "advisory",
              ruleId: "workspace/example-valid",
              severity: "error",
              message: "Observed state differs.",
              location: { file: ".axm/settings.json" },
            },
          },
        ],
        counts: { total: 1, errors: 1, warnings: 0, infos: 0 },
        exitCategory: "errors",
        driftBanner: [],
      },
      input: { view: "workspace" },
    });
    expect(document.findings[0]).toMatchObject({
      subject: ".axm/settings.json",
      authority: ".axm/settings.json",
      observed: "Observed state differs.",
      expected: "Example state is valid.",
    });
  });

  it("keeps strictness as exit policy without relabeling warnings", () => {
    expect(resolveLintExitCategory({ category: "warnings", strict: false })).toBe("success");
    expect(resolveLintExitCategory({ category: "warnings", strict: true })).toBe("fail");
  });
});
