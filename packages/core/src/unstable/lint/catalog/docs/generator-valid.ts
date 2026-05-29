import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { isFileIndexColumn } from "../../../docs/generators.js";
import type { FileGeneratorSpec } from "../../../docs/manifest-schema.js";
import type { DocsRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { advisory, decodeDocsManifest, DOCS_JSON, isUnsafeWorkspaceTarget } from "./helpers.js";

const RULE_ID = "docs/generator-valid";
const tocOptions = new Set(["source", "region"]);
const fileIndexOptions = new Set([
  "format",
  "include",
  "exclude",
  "maxDepth",
  "includeHidden",
  "respectGitignore",
  "columns",
]);

export const generatorValidRule: AdvisoryRule<DocsRuleContext> = {
  id: RULE_ID,
  description: "Generated file contents use supported generators and option shapes.",
  kind: "advisory",
  severity: "error",
  check: (docs) =>
    Effect.succeed(
      ((): ReadonlyArray<AdvisoryFinding> => {
        const manifest = decodeDocsManifest(docs.subject.docsJson);
        if (Option.isNone(manifest)) {
          return [];
        }

        const findings: Array<AdvisoryFinding> = [];
        for (const [index, entry] of manifest.value.contents.entries()) {
          if (entry.source.kind !== "generated") {
            continue;
          }
          findings.push(...validateGenerator(index + 1, entry.source.generator));
        }
        return findings;
      })(),
    ),
};

const validateGenerator = (
  entryNumber: number,
  generator: FileGeneratorSpec,
): ReadonlyArray<AdvisoryFinding> => {
  switch (generator.name) {
    case "toc":
      return validateTocGenerator(entryNumber, generator);
    case "file-index":
      return validateFileIndexGenerator(entryNumber, generator);
  }
};

const validateTocGenerator = (
  entryNumber: number,
  generator: FileGeneratorSpec,
): ReadonlyArray<AdvisoryFinding> => {
  const findings = unknownOptionFindings(entryNumber, generator, tocOptions);
  const source = generator.options?.["source"];
  if (typeof source !== "string" || source.trim() === "") {
    findings.push(optionFinding(entryNumber, "toc", "source", "must be a non-empty string."));
  } else if (isUnsafeWorkspaceTarget(source)) {
    findings.push(
      optionFinding(entryNumber, "toc", "source", "must be a relative workspace path."),
    );
  }
  const region = generator.options?.["region"];
  if (region !== undefined && typeof region !== "string") {
    findings.push(optionFinding(entryNumber, "toc", "region", "must be a string when set."));
  }
  return findings;
};

const validateFileIndexGenerator = (
  entryNumber: number,
  generator: FileGeneratorSpec,
): ReadonlyArray<AdvisoryFinding> => {
  const findings = unknownOptionFindings(entryNumber, generator, fileIndexOptions);
  const format = generator.options?.["format"];
  if (format !== undefined && format !== "list" && format !== "tree" && format !== "table") {
    findings.push(
      optionFinding(entryNumber, "file-index", "format", "must be 'list', 'tree', or 'table'."),
    );
  }
  for (const key of ["include", "exclude"]) {
    const value = generator.options?.[key];
    if (value !== undefined && typeof value !== "string") {
      findings.push(
        optionFinding(entryNumber, "file-index", key, "must be a comma-separated string."),
      );
    }
  }
  const maxDepth = generator.options?.["maxDepth"];
  if (
    maxDepth !== undefined &&
    (typeof maxDepth !== "number" || !Number.isInteger(maxDepth) || maxDepth < 0)
  ) {
    findings.push(
      optionFinding(entryNumber, "file-index", "maxDepth", "must be a non-negative integer."),
    );
  }
  for (const key of ["includeHidden", "respectGitignore"]) {
    const value = generator.options?.[key];
    if (value !== undefined && typeof value !== "boolean") {
      findings.push(optionFinding(entryNumber, "file-index", key, "must be a boolean."));
    }
  }
  const columns = generator.options?.["columns"];
  if (columns !== undefined) {
    if (typeof columns !== "string") {
      findings.push(
        optionFinding(
          entryNumber,
          "file-index",
          "columns",
          "must be a comma-separated string of column names.",
        ),
      );
    } else {
      const parts = columns
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const unknown = parts.find((part) => !isFileIndexColumn(part));
      if (unknown !== undefined) {
        findings.push(
          optionFinding(
            entryNumber,
            "file-index",
            "columns",
            `contains unknown column '${unknown}'. Allowed: path, fileName, link, title, description.`,
          ),
        );
      }
    }
  }
  return findings;
};

const unknownOptionFindings = (
  entryNumber: number,
  generator: FileGeneratorSpec,
  allowed: ReadonlySet<string>,
): Array<AdvisoryFinding> => {
  const findings: Array<AdvisoryFinding> = [];
  for (const key of Object.keys(generator.options ?? {})) {
    if (allowed.has(key)) {
      continue;
    }
    findings.push(optionFinding(entryNumber, generator.name, key, "is not a supported option."));
  }
  return findings;
};

const optionFinding = (
  entryNumber: number,
  generator: string,
  option: string,
  detail: string,
): AdvisoryFinding =>
  advisory(
    RULE_ID,
    "error",
    `File contents entry ${entryNumber} uses generator '${generator}' with invalid option '${option}': ${detail}`,
    DOCS_JSON,
  );
