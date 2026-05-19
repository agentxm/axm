import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { ContextFilesRuleContext } from "../context.js";
import { evaluateContexts } from "../evaluate.js";
import { platformCanonicalLintConfig } from "../config.js";
import { makeVftContextFilesAccessor } from "./context-files-accessor/vft.js";
import { contextFilesRules } from "./context-files.js";

const V1_CONTEXT_FILES_RULES = [
  { id: "context-files/manifest-present", severity: "error", kind: "advisory" },
  { id: "context-files/manifest-schema-valid", severity: "error", kind: "advisory" },
  { id: "context-files/manifest-keys-recognized", severity: "error", kind: "advisory" },
  { id: "context-files/package-valid", severity: "error", kind: "advisory" },
  { id: "context-files/target-valid", severity: "error", kind: "advisory" },
  { id: "context-files/template-valid", severity: "error", kind: "advisory" },
  { id: "context-files/generator-valid", severity: "error", kind: "advisory" },
  { id: "context-files/marker-valid", severity: "error", kind: "advisory" },
] as const;

describe("contextFilesRules catalog membership", () => {
  it("exports the v1 file rules in declaration order", () => {
    expect(contextFilesRules.map((r) => r.id)).toEqual(V1_CONTEXT_FILES_RULES.map((r) => r.id));
  });

  it("pins each rule to the v1 severity", () => {
    expect(contextFilesRules.map((r) => ({ id: r.id, severity: r.severity }))).toEqual(
      V1_CONTEXT_FILES_RULES.map(({ id, severity }) => ({ id, severity })),
    );
  });

  it("pins each rule to kind 'advisory' at v1", () => {
    expect(contextFilesRules.map((r) => ({ id: r.id, kind: r.kind }))).toEqual(
      V1_CONTEXT_FILES_RULES.map(({ id, kind }) => ({ id, kind })),
    );
  });
});

describe("contextFilesRules semantic checks", () => {
  it.effect("reports undeclared template inputs and orphan payloads", () =>
    Effect.gen(function* () {
      const findings = yield* runContextFilesRules({
        manifest: {
          owner: "@acme",
          type: "file",
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

      expect(findings.map((finding) => finding.ruleId)).toContain("context-files/template-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("context-files/package-valid");
      expect(
        findings.some((finding) => finding.message.includes("undeclared input 'license'")),
      ).toBe(true);
      expect(
        findings.some((finding) =>
          finding.message.includes("no context-files.json contents entry"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("reports unsafe targets, invalid generators, and comment-less managed regions", () =>
    Effect.gen(function* () {
      const findings = yield* runContextFilesRules({
        manifest: {
          owner: "@acme",
          type: "file",
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

      expect(findings.map((finding) => finding.ruleId)).toContain("context-files/target-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("context-files/generator-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("context-files/marker-valid");
    }),
  );
});

const runContextFilesRules = (args: {
  readonly manifest: unknown;
  readonly files: Readonly<Record<string, string>>;
}) =>
  Effect.gen(function* () {
    const context: ContextFilesRuleContext = {
      subject: { contextFilesJson: args.manifest },
      files: makeVftContextFilesAccessor(makeTree(args.files)),
      displayRoot: "",
    };
    const evaluated = yield* evaluateContexts(
      contextFilesRules,
      [context],
      platformCanonicalLintConfig,
    );
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
