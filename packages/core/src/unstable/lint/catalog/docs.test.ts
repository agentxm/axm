import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { DocsRuleContext } from "../context.js";
import { evaluateContexts } from "../evaluate.js";
import { platformCanonicalLintConfig } from "../config.js";
import { makeVftDocsAccessor } from "./docs-accessor/vft.js";
import { docsRules } from "./docs.js";

const V1_DOCS_RULES = [
  { id: "docs/manifest-present", severity: "error", kind: "advisory" },
  { id: "docs/manifest-schema-valid", severity: "error", kind: "advisory" },
  { id: "docs/manifest-keys-recognized", severity: "error", kind: "advisory" },
  { id: "docs/package-valid", severity: "error", kind: "advisory" },
  { id: "docs/target-valid", severity: "error", kind: "advisory" },
  { id: "docs/template-valid", severity: "error", kind: "advisory" },
  { id: "docs/generator-valid", severity: "error", kind: "advisory" },
  { id: "docs/marker-valid", severity: "error", kind: "advisory" },
] as const;

describe("docsRules catalog membership", () => {
  it("exports the v1 file rules in declaration order", () => {
    expect(docsRules.map((r) => r.id)).toEqual(V1_DOCS_RULES.map((r) => r.id));
  });

  it("pins each rule to the v1 severity", () => {
    expect(docsRules.map((r) => ({ id: r.id, severity: r.severity }))).toEqual(
      V1_DOCS_RULES.map(({ id, severity }) => ({ id, severity })),
    );
  });

  it("pins each rule to kind 'advisory' at v1", () => {
    expect(docsRules.map((r) => ({ id: r.id, kind: r.kind }))).toEqual(
      V1_DOCS_RULES.map(({ id, kind }) => ({ id, kind })),
    );
  });
});

describe("docsRules semantic checks", () => {
  it.effect("reports undeclared template inputs and orphan payloads", () =>
    Effect.gen(function* () {
      const findings = yield* runDocsRules({
        manifest: {
          owner: "@acme",
          type: "docs",
          name: "baseline",
          version: "1.0.0",
          inputs: {},
          contents: [
            {
              source: { kind: "template", path: "README.md" },
              target: "README.md",
              mode: "sync-always",
            },
          ],
        },
        files: {
          "src/README.md": "License: ${inputs.license}\n",
          "src/unused.md": "unused\n",
        },
      });

      expect(findings.map((finding) => finding.ruleId)).toContain("docs/template-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("docs/package-valid");
      expect(
        findings.some((finding) => finding.message.includes("undeclared input 'license'")),
      ).toBe(true);
      expect(
        findings.some((finding) => finding.message.includes("no docs.json contents entry")),
      ).toBe(true);
    }),
  );

  it.effect("reports unsafe targets, invalid generators, and comment-less managed regions", () =>
    Effect.gen(function* () {
      const findings = yield* runDocsRules({
        manifest: {
          owner: "@acme",
          type: "docs",
          name: "baseline",
          version: "1.0.0",
          contents: [
            {
              source: { kind: "generated", generator: { name: "toc", options: { source: 1 } } },
              target: "../README.md",
              mode: "sync-always",
            },
            {
              source: { kind: "static", path: "config.json" },
              target: "package.json",
              mode: "managed-region",
              region: "deps",
            },
          ],
        },
        files: {
          "src/config.json": "{}\n",
        },
      });

      expect(findings.map((finding) => finding.ruleId)).toContain("docs/target-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("docs/generator-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("docs/marker-valid");
    }),
  );
});

const runDocsRules = (args: {
  readonly manifest: unknown;
  readonly files: Readonly<Record<string, string>>;
}) =>
  Effect.gen(function* () {
    const context: DocsRuleContext = {
      subject: { docsJson: args.manifest },
      files: makeVftDocsAccessor(makeTree(args.files)),
      displayRoot: "",
    };
    const evaluated = yield* evaluateContexts(docsRules, [context], platformCanonicalLintConfig);
    return evaluated.flatMap((entry) => entry.findings);
  });

const makeTree = (files: Readonly<Record<string, string>>) => {
  const encoder = new TextEncoder();
  const keys = Object.keys(files);
  const read = (path: string): Uint8Array | undefined => {
    const value = files[path];
    return value === undefined ? undefined : encoder.encode(value);
  };
  return {
    hasFile: (path: string) => read(path) !== undefined,
    getFile: read,
    listFiles: (prefix: string): ReadonlyArray<string> => {
      const normalized = prefix === "" ? "" : `${prefix.replace(/\/+$/, "")}/`;
      return keys.filter((key) => key.startsWith(normalized));
    },
  };
};
