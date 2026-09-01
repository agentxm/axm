import * as fs from "node:fs";
import * as path from "node:path";

/**
 * C0 control bytes permitted in source files: tab, LF, CR, and ESC (used by
 * ANSI rendering fixtures). Any other C0 control byte breaks text tooling —
 * `grep` reports no matches and `file` classifies the file as data — so an
 * automated check can silently skip the file while reporting success.
 */
const ALLOWED_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d, 0x1b]);

export type ControlByteViolation = {
  readonly filePath: string;
  readonly line: number;
  readonly byte: number;
};

export type MachineOutputBoundaryViolation = {
  readonly filePath: string;
  readonly line: number;
  readonly construct: string;
  readonly reason: string;
};

export type PromptBoundaryViolation = {
  readonly filePath: string;
  readonly line: number;
  readonly reason: string;
};

export type AxmEnvironmentContractViolation = {
  readonly variable: string;
  readonly filePath: string;
  readonly line: number;
  readonly reason: string;
};

const isForbiddenControlByte = (byte: number): boolean =>
  byte < 0x20 && !ALLOWED_CONTROL_BYTES.has(byte);

export const findControlBytes = (
  filePath: string,
  contents: Buffer,
): ReadonlyArray<ControlByteViolation> => {
  const violations: ControlByteViolation[] = [];
  let line = 1;
  for (const byte of contents) {
    if (byte === 0x0a) {
      line += 1;
      continue;
    }
    if (isForbiddenControlByte(byte)) {
      violations.push({ filePath, line, byte });
    }
  }
  return violations;
};

const walkTypeScriptSources = (dir: string, results: string[]): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTypeScriptSources(entryPath, results);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(entryPath);
    }
  }
};

const isProductionTypeScriptSource = (filePath: string): boolean =>
  (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) &&
  !filePath.endsWith(".test.ts") &&
  !filePath.endsWith(".spec.ts") &&
  !filePath.includes(`${path.sep}__generated__${path.sep}`);

/**
 * Scan every `packages/<package>/src/**` TypeScript source under `repoRoot`
 * for forbidden C0 control bytes.
 */
export const findSourceHygieneViolations = (
  repoRoot: string,
): ReadonlyArray<ControlByteViolation> => {
  const packagesRoot = path.join(repoRoot, "packages");
  const sourceFiles: string[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcRoot = path.join(packagesRoot, entry.name, "src");
    if (!fs.existsSync(srcRoot)) continue;
    walkTypeScriptSources(srcRoot, sourceFiles);
  }

  const violations: ControlByteViolation[] = [];
  for (const filePath of sourceFiles) {
    const contents = fs.readFileSync(filePath);
    for (const violation of findControlBytes(path.relative(repoRoot, filePath), contents)) {
      violations.push(violation);
    }
  }
  return violations;
};

const MACHINE_STDOUT_WRITERS = new Set([
  path.join(
    "packages",
    "extension-management",
    "src",
    "unstable",
    "cli-renderer",
    "renderer-helpers.ts",
  ),
  path.join(
    "packages",
    "extension-management",
    "src",
    "unstable",
    "cli-runtime",
    "handle-error.ts",
  ),
  path.join(
    "packages",
    "extension-management",
    "src",
    "unstable",
    "cli-runtime",
    "run-cli-main.ts",
  ),
  path.join(
    "packages",
    "extension-management",
    "src",
    "unstable",
    "cli-runtime",
    "runtime-envelope.ts",
  ),
]);

const PROMPT_RUN_BOUNDARY = path.join(
  "packages",
  "extension-management",
  "src",
  "unstable",
  "cli",
  "prompt",
  "helpers.ts",
);

const lineAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length;

/**
 * Guard the production machine-output boundary.
 *
 * Command handlers must render through CliRenderer, and ordinary `--json`
 * output is one buffered document rather than a stream. Only the renderer and
 * runtime envelope/bootstrap implementations may write stdout directly.
 */
export const findMachineOutputBoundaryViolations = (
  repoRoot: string,
): ReadonlyArray<MachineOutputBoundaryViolation> => {
  const roots = [
    path.join(repoRoot, "packages", "cli", "src"),
    path.join(repoRoot, "packages", "extension-management", "src", "unstable"),
    path.join(repoRoot, "packages", "extension-model", "src", "unstable"),
    path.join(repoRoot, "packages", "extension-workspace", "src"),
    path.join(repoRoot, "packages", "registry-protocol", "src", "unstable"),
    path.join(repoRoot, "packages", "workspace-operations", "src"),
    path.join(repoRoot, "packages", "workspace-state", "src"),
  ];
  const sourceFiles: string[] = [];
  for (const root of roots) {
    if (fs.existsSync(root)) walkTypeScriptSources(root, sourceFiles);
  }

  const violations: Array<MachineOutputBoundaryViolation> = [];
  for (const filePath of sourceFiles.filter(isProductionTypeScriptSource)) {
    const relativePath = path.relative(repoRoot, filePath);
    const source = fs.readFileSync(filePath, "utf8");

    if (!MACHINE_STDOUT_WRITERS.has(relativePath)) {
      for (const construct of ["process.stdout.write", "console.log"] as const) {
        let offset = source.indexOf(construct);
        while (offset >= 0) {
          violations.push({
            filePath: relativePath,
            line: lineAtOffset(source, offset),
            construct,
            reason:
              "production stdout must flow through the approved CLI renderer/runtime boundary",
          });
          offset = source.indexOf(construct, offset + construct.length);
        }
      }
    }

    let streamOffset = source.indexOf("resultStream");
    while (streamOffset >= 0) {
      violations.push({
        filePath: relativePath,
        line: lineAtOffset(source, streamOffset),
        construct: "resultStream",
        reason:
          "ordinary --json output is one document; streaming requires a future explicit output mode",
      });
      streamOffset = source.indexOf("resultStream", streamOffset + "resultStream".length);
    }
  }

  return violations;
};

/** Ensure production prompts cannot bypass non-interactive and JSON-mode policy. */
export const findPromptBoundaryViolations = (
  repoRoot: string,
): ReadonlyArray<PromptBoundaryViolation> => {
  const sourceFiles: string[] = [];
  for (const root of [
    path.join(repoRoot, "packages", "cli", "src"),
    path.join(repoRoot, "packages", "extension-management", "src"),
    path.join(repoRoot, "packages", "extension-model", "src"),
    path.join(repoRoot, "packages", "extension-workspace", "src"),
    path.join(repoRoot, "packages", "registry-protocol", "src"),
    path.join(repoRoot, "packages", "workspace-operations", "src"),
    path.join(repoRoot, "packages", "workspace-state", "src"),
  ]) {
    if (fs.existsSync(root)) walkTypeScriptSources(root, sourceFiles);
  }

  const violations: PromptBoundaryViolation[] = [];
  for (const filePath of sourceFiles.filter(isProductionTypeScriptSource)) {
    const relativePath = path.relative(repoRoot, filePath);
    if (relativePath === PROMPT_RUN_BOUNDARY) continue;
    const source = fs.readFileSync(filePath, "utf8");
    let offset = source.indexOf("Prompt.run");
    while (offset >= 0) {
      violations.push({
        filePath: relativePath,
        line: lineAtOffset(source, offset),
        reason: "production prompts must run through requireInteractive",
      });
      offset = source.indexOf("Prompt.run", offset + "Prompt.run".length);
    }
  }
  return violations;
};

const UNBOUNDED_CONCURRENCY_LITERAL = /concurrency\s*:\s*["']unbounded["']/g;

/**
 * Count the reviewed production baseline of literal unbounded traversals.
 * The caller treats this as a ratchet: removals lower the recorded ceiling;
 * additions must classify the workload instead of spending that headroom.
 */
export const countUnboundedConcurrencySites = (repoRoot: string): number => {
  const packagesRoot = path.join(repoRoot, "packages");
  const sourceFiles: string[] = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const srcRoot = path.join(packagesRoot, entry.name, "src");
    if (fs.existsSync(srcRoot)) walkTypeScriptSources(srcRoot, sourceFiles);
  }

  return sourceFiles
    .filter(isProductionTypeScriptSource)
    .reduce(
      (count, filePath) =>
        count +
        Array.from(fs.readFileSync(filePath, "utf8").matchAll(UNBOUNDED_CONCURRENCY_LITERAL))
          .length,
      0,
    );
};

const AXM_ENVIRONMENT_LITERAL = /["'](AXM_[A-Z0-9_]+)["']/g;
const AXM_ENVIRONMENT_CONTRACT_ROW =
  /^\|\s*`(AXM_[A-Z0-9_]+)`\s*\|\s*(stable automation|internal)\s*\|/;

/**
 * Keep production AXM environment reads and the public environment reference
 * in exact correspondence. An exact AXM-prefixed string literal in CLI or core
 * production code is treated as an environment control and must be classified.
 */
export const findAxmEnvironmentContractViolations = (
  repoRoot: string,
): ReadonlyArray<AxmEnvironmentContractViolation> => {
  const sourceFiles: string[] = [];
  for (const root of [
    path.join(repoRoot, "packages", "cli", "src"),
    path.join(repoRoot, "packages", "extension-management", "src"),
    path.join(repoRoot, "packages", "extension-model", "src"),
    path.join(repoRoot, "packages", "extension-workspace", "src"),
    path.join(repoRoot, "packages", "registry-protocol", "src"),
    path.join(repoRoot, "packages", "workspace-operations", "src"),
    path.join(repoRoot, "packages", "workspace-state", "src"),
  ]) {
    if (fs.existsSync(root)) walkTypeScriptSources(root, sourceFiles);
  }

  const sourceLocations = new Map<string, { readonly filePath: string; readonly line: number }>();
  for (const filePath of sourceFiles.filter(isProductionTypeScriptSource)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(AXM_ENVIRONMENT_LITERAL)) {
      const variable = match[1];
      if (variable === undefined || sourceLocations.has(variable)) continue;
      sourceLocations.set(variable, {
        filePath: path.relative(repoRoot, filePath),
        line: lineAtOffset(source, match.index),
      });
    }
  }

  const contractPath = path.join(repoRoot, "packages", "cli", "help", "topics", "environment.md");
  if (!fs.existsSync(contractPath)) {
    return [
      {
        variable: "AXM_ENVIRONMENT_CONTRACT",
        filePath: path.relative(repoRoot, contractPath),
        line: 1,
        reason: "canonical environment reference is missing",
      },
    ];
  }

  const contract = fs.readFileSync(contractPath, "utf8");
  const contractLocations = new Map<string, number>();
  const violations: AxmEnvironmentContractViolation[] = [];
  for (const [index, line] of contract.split("\n").entries()) {
    const match = AXM_ENVIRONMENT_CONTRACT_ROW.exec(line);
    const variable = match?.[1];
    if (variable === undefined) continue;
    const previousLine = contractLocations.get(variable);
    if (previousLine !== undefined) {
      violations.push({
        variable,
        filePath: path.relative(repoRoot, contractPath),
        line: index + 1,
        reason: `classified more than once (first classification is on line ${previousLine})`,
      });
      continue;
    }
    contractLocations.set(variable, index + 1);
  }

  for (const [variable, location] of sourceLocations) {
    if (!contractLocations.has(variable)) {
      violations.push({
        variable,
        ...location,
        reason: "production AXM environment literal lacks a classified reference row",
      });
    }
  }

  for (const [variable, line] of contractLocations) {
    if (!sourceLocations.has(variable)) {
      violations.push({
        variable,
        filePath: path.relative(repoRoot, contractPath),
        line,
        reason: "classified reference row has no production CLI/core string literal",
      });
    }
  }

  return violations.sort(
    (left, right) =>
      left.variable.localeCompare(right.variable) ||
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line,
  );
};

export const formatViolation = (violation: ControlByteViolation): string =>
  `${violation.filePath}:${violation.line} contains forbidden control byte 0x${violation.byte
    .toString(16)
    .padStart(2, "0")}`;

export const formatMachineOutputBoundaryViolation = (
  violation: MachineOutputBoundaryViolation,
): string =>
  `${violation.filePath}:${violation.line} uses ${violation.construct}: ${violation.reason}`;

export const formatPromptBoundaryViolation = (violation: PromptBoundaryViolation): string =>
  `${violation.filePath}:${violation.line} uses Prompt.run: ${violation.reason}`;

export const formatAxmEnvironmentContractViolation = (
  violation: AxmEnvironmentContractViolation,
): string => `${violation.filePath}:${violation.line} ${violation.variable}: ${violation.reason}`;

export type TestTaxonomyViolation = {
  readonly _tag: "TestTaxonomyViolation";
  readonly filePath: string;
  readonly reason: string;
};

const PACKAGE_TEST_SUFFIXES = [
  ".internal.test.ts",
  ".e2e.test.ts",
  ".windows.test.ts",
  ".windows.e2e.test.ts",
  ".tooling.test.ts",
  ".artifact.test.ts",
] as const;

const walkFiles = (dir: string, results: string[]): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "out-tsc") {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, results);
    } else {
      results.push(entryPath);
    }
  }
};

/**
 * Enforce the test-purpose filename taxonomy: authoritative `*.spec.ts` lives
 * only under `specifications/`, every test in a package names its purpose
 * (`internal`, `e2e`, `windows`, `tooling`, `artifact`), no generic
 * `*.test.ts` remains, and diagnostic benchmarks live under `benchmarks/`.
 */
export const findTestTaxonomyViolations = (
  repoRoot: string,
): ReadonlyArray<TestTaxonomyViolation> => {
  const violations: TestTaxonomyViolation[] = [];
  const roots = ["packages", "scripts"];
  for (const root of roots) {
    const rootPath = path.join(repoRoot, root);
    if (!fs.existsSync(rootPath)) {
      continue;
    }
    const files: string[] = [];
    walkFiles(rootPath, files);
    for (const filePath of files) {
      const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
      const name = path.basename(filePath);
      if (name.endsWith(".spec.ts")) {
        violations.push({
          _tag: "TestTaxonomyViolation",
          filePath: relativePath,
          reason:
            "authoritative *.spec.ts files live only under specifications/; classify this file's purpose",
        });
        continue;
      }
      if (name.endsWith(".bench.ts")) {
        violations.push({
          _tag: "TestTaxonomyViolation",
          filePath: relativePath,
          reason: "diagnostic benchmarks live under benchmarks/",
        });
        continue;
      }
      if (
        name.endsWith(".test.ts") &&
        !PACKAGE_TEST_SUFFIXES.some((suffix) => name.endsWith(suffix))
      ) {
        violations.push({
          _tag: "TestTaxonomyViolation",
          filePath: relativePath,
          reason:
            "generic *.test.ts is retired; name the purpose (.internal|.e2e|.windows|.tooling|.artifact).test.ts",
        });
      }
    }
  }
  return violations.sort((left, right) => left.filePath.localeCompare(right.filePath));
};

export const formatTestTaxonomyViolation = (violation: TestTaxonomyViolation): string =>
  `${violation.filePath}: ${violation.reason}`;
