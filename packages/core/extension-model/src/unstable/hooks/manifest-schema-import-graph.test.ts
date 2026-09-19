import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const importPattern = /(?:from\s+|import\s*\()\s*["'](\.[^"']+)["']/gu;

const resolveRelativeModule = (sourcePath: string, specifier: string): string => {
  const requested = resolve(dirname(sourcePath), specifier);
  const candidates = [
    requested,
    requested.replace(/\.js$/u, ".ts"),
    `${requested}.ts`,
    resolve(requested, "index.ts"),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (resolved === undefined) {
    throw new Error(`Cannot resolve ${specifier} imported by ${sourcePath}`);
  }
  return resolved;
};

const relativeImportClosure = (entryPath: string): ReadonlySet<string> => {
  const visited = new Set<string>();
  const visit = (sourcePath: string): void => {
    if (visited.has(sourcePath)) return;
    visited.add(sourcePath);
    const source = readFileSync(sourcePath, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier !== undefined) visit(resolveRelativeModule(sourcePath, specifier));
    }
  };
  visit(entryPath);
  return visited;
};

describe("hook manifest schema import graph", () => {
  it("reaches schema vocabulary without loading per-agent catalog data", () => {
    const entryPath = resolve(import.meta.dirname, "manifest-schema.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    const closure = [...relativeImportClosure(entryPath)];

    expect(entrySource).toContain('from "../agent-capabilities/schema.js"');
    expect(entrySource).not.toContain('from "../agent-capabilities/index.js"');
    expect(closure.filter((path) => path.includes("/agent-capabilities/data/agents/"))).toEqual([]);
  });
});
