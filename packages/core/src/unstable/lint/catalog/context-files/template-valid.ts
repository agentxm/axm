import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ContextFilesRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import {
  advisory,
  decodeContextFilesManifest,
  CONTEXT_FILES_JSON,
  readPayloadString,
  sourcePaths,
  srcPath,
} from "./helpers.js";

const RULE_ID = "context-files/template-valid";
const templateExpressionPattern = /\$\{([^}]+)\}/g;
const secretNamePattern = /(?:secret|token|password|passwd|api[-_]?key|private[-_]?key)/i;

export const templateValidRule: AdvisoryRule<ContextFilesRuleContext> = {
  id: RULE_ID,
  description: "File templates reference declared scalar inputs and avoid secret-shaped inputs.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const manifest = decodeContextFilesManifest(context.subject.contextFilesJson);
      if (Option.isNone(manifest)) {
        return [];
      }

      const declaredInputs = new Set(Object.keys(manifest.value.inputs ?? {}));
      const findings: Array<AdvisoryFinding> = [];
      for (const inputName of declaredInputs) {
        if (!secretNamePattern.test(inputName)) {
          continue;
        }
        findings.push(
          advisory(
            RULE_ID,
            "warning",
            `File input '${inputName}' looks secret-shaped. File templates do not support secret templating; use non-secret scalar inputs only.`,
            CONTEXT_FILES_JSON,
          ),
        );
      }

      for (const entry of manifest.value.contents) {
        if (entry.source.kind !== "template") {
          continue;
        }
        for (const payloadPath of sourcePaths(entry.source)) {
          const content = yield* readPayloadString(context, payloadPath);
          if (Option.isNone(content)) {
            continue;
          }
          for (const expression of templateExpressions(content.value)) {
            const [namespace, key, extra] = expression.split(".");
            if (namespace === undefined || key === undefined || extra !== undefined) {
              findings.push(
                advisory(
                  RULE_ID,
                  "error",
                  `Template payload '${payloadPath}' contains unsupported expression '\${${expression}}'. Use \${inputs.*}, \${vars.*}, or \${workspace.root}.`,
                  srcPath(payloadPath),
                ),
              );
              continue;
            }
            if (namespace === "inputs" && !declaredInputs.has(key)) {
              findings.push(
                advisory(
                  RULE_ID,
                  "error",
                  `Template payload '${payloadPath}' references undeclared input '${key}'. Declare it in context-files.json inputs or remove the placeholder.`,
                  srcPath(payloadPath),
                ),
              );
            } else if (namespace === "workspace" && key !== "root") {
              findings.push(
                advisory(
                  RULE_ID,
                  "error",
                  `Template payload '${payloadPath}' references unsupported workspace value '${key}'. Only \${workspace.root} is supported.`,
                  srcPath(payloadPath),
                ),
              );
            } else if (
              namespace !== "inputs" &&
              namespace !== "vars" &&
              namespace !== "workspace"
            ) {
              findings.push(
                advisory(
                  RULE_ID,
                  "error",
                  `Template payload '${payloadPath}' references unsupported namespace '${namespace}'. Use inputs, vars, or workspace.`,
                  srcPath(payloadPath),
                ),
              );
            }
          }
        }
      }

      return findings;
    }),
};

const templateExpressions = (content: string): ReadonlyArray<string> => {
  const expressions: Array<string> = [];
  let match = templateExpressionPattern.exec(content);
  while (match !== null) {
    const expression = match[1];
    if (expression !== undefined) {
      expressions.push(expression);
    }
    match = templateExpressionPattern.exec(content);
  }
  return expressions;
};
