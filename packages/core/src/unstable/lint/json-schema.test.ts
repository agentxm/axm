import { describe, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { CATALOG_GROUP_ORDER } from "./catalog-contexts.js";
import { toLintJsonDocument } from "./cli.js";
import { LintJsonDocumentSchema } from "./json-schema.js";

const decode = Schema.decodeUnknownResult(LintJsonDocumentSchema);

describe("LintJsonDocumentSchema", () => {
  it("round-trips a document built by toLintJsonDocument", () => {
    const document = toLintJsonDocument({
      input: { view: "workspace" },
      summary: {
        findings: [
          {
            group: "skill",
            displayRoot: ".axm/extensions/@acme/skills/demo/src",
            path: ".axm/extensions/@acme/skills/demo/src/skill.json",
            finding: {
              kind: "advisory",
              ruleId: "skill/manifest-present",
              severity: "error",
              message: "skill.json is missing.",
              location: { file: "skill.json", line: 1, column: 2 },
            },
          },
          {
            group: "knowledge",
            displayRoot: ".axm/extensions/@acme/knowledge/domain",
            path: ".axm/extensions/@acme/knowledge/domain",
            finding: {
              kind: "advisory",
              ruleId: "knowledge/recommended-packs-valid",
              severity: "warning",
              message: "recommendedPacks entry pins a version range.",
            },
          },
        ],
        counts: { total: 2, errors: 1, warnings: 1, infos: 0 },
        exitCategory: "errors",
        driftBanner: ["skill/manifest-schema-valid"],
      },
      fixSummary: { attempted: 1, applied: 1, failed: 0, warnings: [] },
    });

    const decoded = decode(document);
    expect(Result.isSuccess(decoded)).toBe(true);
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toStrictEqual(document);
    }
  });

  it("accepts every catalog group as a finding group", () => {
    for (const group of CATALOG_GROUP_ORDER) {
      const decoded = decode({
        input: { view: "workspace" },
        findings: [
          {
            group,
            kind: "advisory",
            ruleId: `${group}/example`,
            severity: "info",
            message: "example",
            displayRoot: "",
            path: "",
          },
        ],
        summary: { total: 1, errors: 0, warnings: 0, infos: 1, exitCategory: "clean" },
        driftBanner: [],
      });
      expect(Result.isSuccess(decoded), group).toBe(true);
    }
  });

  it("accepts a Git-index input with an opaque fingerprint", () => {
    const decoded = decode({
      input: { view: "git-index", fingerprint: `sha256:${"a".repeat(64)}` },
      findings: [],
      summary: { total: 0, errors: 0, warnings: 0, infos: 0, exitCategory: "clean" },
      driftBanner: [],
    });
    expect(Result.isSuccess(decoded)).toBe(true);
  });

  it("rejects a Git-index input without a valid fingerprint", () => {
    for (const input of [{ view: "git-index" }, { view: "git-index", fingerprint: "/tmp/repo" }]) {
      const decoded = decode({
        input,
        findings: [],
        summary: { total: 0, errors: 0, warnings: 0, infos: 0, exitCategory: "clean" },
        driftBanner: [],
      });
      expect(Result.isFailure(decoded)).toBe(true);
    }
  });

  it("rejects a finding group that is not a catalog", () => {
    const decoded = decode({
      input: { view: "workspace" },
      findings: [
        {
          group: "not-a-catalog",
          kind: "advisory",
          ruleId: "x/y",
          severity: "info",
          message: "example",
          displayRoot: "",
          path: "",
        },
      ],
      summary: { total: 1, errors: 0, warnings: 0, infos: 1, exitCategory: "clean" },
      driftBanner: [],
    });
    expect(Result.isFailure(decoded)).toBe(true);
  });
});
