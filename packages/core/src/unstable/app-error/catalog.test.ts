import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { ErrorCodeCatalog } from "./__generated__/catalog.js";
import { KnownErrorCodePrefixes } from "./code-prefixes.js";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const PACKAGES_ROOT = path.join(WORKSPACE_ROOT, "packages");
const CATALOG_PATH = "packages/core/src/unstable/app-error/__generated__/catalog.ts";
const DOC_PATH = "docs/error-codes.md";

interface ErrorCall {
  readonly code: string | undefined;
  readonly category: string | undefined;
  readonly what: string | undefined;
  readonly hasCategory: boolean;
  readonly categoryIsLiteral: boolean;
  readonly source: string;
  readonly production: boolean;
}

const readFiles = (dir: string): ReadonlyArray<string> => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: Array<string> = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...readFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
};

const packageSourceFiles = (): ReadonlyArray<string> => {
  const files: Array<string> = [];
  for (const scope of fs.readdirSync(PACKAGES_ROOT)) {
    const sourceRoot = path.join(PACKAGES_ROOT, scope, "src");
    if (fs.existsSync(sourceRoot)) {
      files.push(...readFiles(sourceRoot));
    }
  }
  return files;
};

const isProductionSource = (filePath: string): boolean =>
  !filePath.endsWith(".test.ts") &&
  !filePath.endsWith(".type-test.ts") &&
  !filePath.endsWith("test-helpers.ts") &&
  path.relative(WORKSPACE_ROOT, filePath) !== CATALOG_PATH;

const isTargetExpression = (expression: ts.Expression): boolean => {
  if (ts.isIdentifier(expression)) return expression.text === "makeAppError";
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "makeAppError";
  return false;
};

const isAppErrorNewExpression = (node: ts.NewExpression): boolean => {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text === "AppError";
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "AppError";
  return false;
};

const propertyNameText = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
};

const findProperty = (
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined => {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) === name) return property;
  }
  return undefined;
};

const stringLiteralValue = (expression: ts.Expression): string | undefined => {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return undefined;
};

const relativeSource = (sourceFile: ts.SourceFile, objectLiteral: ts.ObjectLiteralExpression) => {
  const pos = sourceFile.getLineAndCharacterOfPosition(objectLiteral.getStart(sourceFile));
  return `${path.relative(WORKSPACE_ROOT, sourceFile.fileName)}:${pos.line + 1}`;
};

const collectCalls = (): ReadonlyArray<ErrorCall> => {
  const calls: Array<ErrorCall> = [];
  for (const filePath of packageSourceFiles()) {
    const source = fs.readFileSync(filePath, "utf8");
    if (!source.includes("makeAppError") && !source.includes("new AppError")) continue;
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

    const record = (objectLiteral: ts.ObjectLiteralExpression): void => {
      const codeProp = findProperty(objectLiteral, "code");
      const categoryProp = findProperty(objectLiteral, "category");
      const whatProp = findProperty(objectLiteral, "what");
      calls.push({
        code: codeProp === undefined ? undefined : stringLiteralValue(codeProp.initializer),
        category:
          categoryProp === undefined ? undefined : stringLiteralValue(categoryProp.initializer),
        what: whatProp === undefined ? undefined : stringLiteralValue(whatProp.initializer),
        hasCategory: categoryProp !== undefined,
        categoryIsLiteral:
          categoryProp !== undefined && stringLiteralValue(categoryProp.initializer) !== undefined,
        source: relativeSource(sourceFile, objectLiteral),
        production: isProductionSource(filePath),
      });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isTargetExpression(node.expression)) {
        const arg = node.arguments[0];
        if (arg !== undefined && ts.isObjectLiteralExpression(arg)) record(arg);
      } else if (ts.isNewExpression(node) && isAppErrorNewExpression(node)) {
        const arg = node.arguments?.[0];
        if (arg !== undefined && ts.isObjectLiteralExpression(arg)) record(arg);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
  return calls;
};

describe("error code catalog", () => {
  it("keeps static code entries internally consistent", () => {
    const byCode = new Map<string, ErrorCall>();
    const conflicts: Array<string> = [];
    for (const call of collectCalls().filter((candidate) => candidate.production)) {
      if (call.code === undefined) continue;
      const existing = byCode.get(call.code);
      if (existing === undefined) {
        byCode.set(call.code, call);
      } else if (existing.category !== call.category) {
        conflicts.push(`${call.code}: ${existing.source} conflicts with ${call.source}`);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("requires every AppError category to be a literal", () => {
    const missing = collectCalls()
      .filter(
        (call) => !call.source.startsWith("packages/core/src/unstable/app-error/app-error.ts:"),
      )
      .filter((call) => !call.hasCategory || !call.categoryIsLiteral)
      .map((call) => call.source);

    expect(missing).toEqual([]);
  });

  it("does not reintroduce the removed guidance field", () => {
    const removedField = ["how", "To", "Fix"].join("");
    const offenders = packageSourceFiles()
      .filter(
        (filePath) =>
          path.relative(WORKSPACE_ROOT, filePath) !==
          "packages/core/src/unstable/app-error/catalog.test.ts",
      )
      .filter((filePath) => fs.readFileSync(filePath, "utf8").includes(removedField))
      .map((filePath) => path.relative(WORKSPACE_ROOT, filePath));

    expect(offenders).toEqual([]);
  });

  it("uses known all-caps error code prefixes", () => {
    const prefixPattern = /^[A-Z][A-Z0-9_]*$/;
    const knownPrefixes = new Set<string>(KnownErrorCodePrefixes);
    const offenders = Object.values(ErrorCodeCatalog)
      .filter((entry) => {
        const prefix = entry.code.split("_")[0] ?? "";
        return !prefixPattern.test(entry.code) || !knownPrefixes.has(prefix);
      })
      .map((entry) => entry.code);

    expect(offenders).toEqual([]);
  });

  it("keeps generated artifacts fresh", () => {
    const generate = childProcess.spawnSync("bun", ["scripts/generate-error-catalog.ts"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
    });
    expect(generate.status).toBe(0);

    const diff = childProcess.spawnSync(
      "git",
      ["diff", "--exit-code", "--", CATALOG_PATH, DOC_PATH],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      },
    );
    expect(diff.status, diff.stdout + diff.stderr).toBe(0);
  });
});
