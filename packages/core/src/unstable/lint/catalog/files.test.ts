import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { FilesRuleContext } from "../context.js";
import { evaluateContexts } from "../evaluate.js";
import { platformCanonicalLintConfig } from "../config.js";
import { makeVftFilesAccessor } from "./files-accessor/vft.js";
import { filesRules } from "./files.js";

const V1_FILES_RULES = [
  { id: "files/manifest-present", severity: "error", kind: "advisory" },
  { id: "files/manifest-schema-valid", severity: "error", kind: "advisory" },
  { id: "files/manifest-keys-recognized", severity: "error", kind: "advisory" },
  { id: "files/package-valid", severity: "error", kind: "advisory" },
  { id: "files/target-valid", severity: "error", kind: "advisory" },
  { id: "files/template-valid", severity: "error", kind: "advisory" },
  { id: "files/generator-valid", severity: "error", kind: "advisory" },
  { id: "files/marker-valid", severity: "error", kind: "advisory" },
  { id: "files/standalone-declaration-valid", severity: "warning", kind: "advisory" },
  { id: "files/recommended-packs-valid", severity: "warning", kind: "advisory" },
] as const;

describe("filesRules catalog membership", () => {
  it("exports the v1 file rules in declaration order", () => {
    expect(filesRules.map((r) => r.id)).toEqual(V1_FILES_RULES.map((r) => r.id));
  });

  it("pins each rule to the v1 severity", () => {
    expect(filesRules.map((r) => ({ id: r.id, severity: r.severity }))).toEqual(
      V1_FILES_RULES.map(({ id, severity }) => ({ id, severity })),
    );
  });

  it("pins each rule to kind 'advisory' at v1", () => {
    expect(filesRules.map((r) => ({ id: r.id, kind: r.kind }))).toEqual(
      V1_FILES_RULES.map(({ id, kind }) => ({ id, kind })),
    );
  });
});

describe("filesRules semantic checks", () => {
  it.effect("reports undeclared template inputs and orphan payloads", () =>
    Effect.gen(function* () {
      const findings = yield* runFilesRules({
        manifest: {
          owner: "@acme",
          type: "files",
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

      expect(findings.map((finding) => finding.ruleId)).toContain("files/template-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("files/package-valid");
      expect(
        findings.some((finding) => finding.message.includes("undeclared input 'license'")),
      ).toBe(true);
      expect(
        findings.some((finding) => finding.message.includes("no files.json contents entry")),
      ).toBe(true);
    }),
  );

  it.effect("reports unsafe targets, invalid generators, and comment-less managed regions", () =>
    Effect.gen(function* () {
      const findings = yield* runFilesRules({
        manifest: {
          owner: "@acme",
          type: "files",
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

      expect(findings.map((finding) => finding.ruleId)).toContain("files/target-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("files/generator-valid");
      expect(findings.map((finding) => finding.ruleId)).toContain("files/marker-valid");
    }),
  );
});

const runFilesRules = (args: {
  readonly manifest: unknown;
  readonly files: Readonly<Record<string, string>>;
}) =>
  Effect.gen(function* () {
    const context: FilesRuleContext = {
      subject: { filesJson: args.manifest },
      files: makeVftFilesAccessor(makeTree(args.files)),
      displayRoot: "",
    };
    const evaluated = yield* evaluateContexts(filesRules, [context], platformCanonicalLintConfig);
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
