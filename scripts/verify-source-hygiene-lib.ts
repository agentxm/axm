import * as fs from "node:fs";
import * as path from "node:path";

import { exportsSpecification, parseSpecificationFile } from "./specification-catalog-lib.js";
import { classifyTestPurpose } from "./test-purpose.js";
import {
  isSpecificationPath,
  productionProjects,
  type Workspace,
  type WorkspaceProject,
} from "./workspace-discovery.js";

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

const isUnder = (filePath: string, directory: string): boolean =>
  directory === "" || filePath === directory || filePath.startsWith(`${directory}/`);

const isTypeScriptSource = (filePath: string): boolean =>
  filePath.endsWith(".ts") || filePath.endsWith(".tsx");

const isProductionTypeScriptSource = (filePath: string): boolean =>
  isTypeScriptSource(filePath) &&
  !filePath.endsWith(".test.ts") &&
  !filePath.endsWith(".spec.ts") &&
  !filePath.split("/").includes("__generated__");

/** Every file the project owns under its source root. */
const sourceFiles = (workspace: Workspace, project: WorkspaceProject): readonly string[] =>
  workspace.filesOf(project).filter((file) => isUnder(file, project.sourceRoot));

/** Every project's TypeScript source, as discovery owns it. */
const typeScriptSources = (
  workspace: Workspace,
  projects: ReadonlyArray<WorkspaceProject> = workspace.projects,
): readonly string[] =>
  projects.flatMap((project) => sourceFiles(workspace, project).filter(isTypeScriptSource));

const readBytes = (workspace: Workspace, file: string): Buffer =>
  fs.readFileSync(path.join(workspace.root, file));

/**
 * Scan every project's source root for forbidden C0 control bytes.
 */
export const findSourceHygieneViolations = (
  workspace: Workspace,
): ReadonlyArray<ControlByteViolation> => {
  const violations: ControlByteViolation[] = [];
  for (const file of [...typeScriptSources(workspace)].sort()) {
    for (const violation of findControlBytes(file, readBytes(workspace, file))) {
      violations.push(violation);
    }
  }
  return violations;
};

const lineAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length;

const UNBOUNDED_CONCURRENCY_LITERAL = /concurrency\s*:\s*["']unbounded["']/g;

/**
 * Count the reviewed production baseline of literal unbounded traversals.
 * The caller treats this as a ratchet: removals lower the recorded ceiling;
 * additions must classify the workload instead of spending that headroom.
 */
export const countUnboundedConcurrencySites = (workspace: Workspace): number =>
  typeScriptSources(workspace)
    .filter(isProductionTypeScriptSource)
    .reduce(
      (count, file) =>
        count + Array.from(workspace.read(file).matchAll(UNBOUNDED_CONCURRENCY_LITERAL)).length,
      0,
    );

const AXM_ENVIRONMENT_LITERAL = /["'](AXM_[A-Z0-9_]+)["']/g;
const AXM_INSTALLER_ENVIRONMENT_REFERENCE = /\b(AXM_[A-Z0-9_]+)\b/g;
const AXM_ENVIRONMENT_CONTRACT_ROW =
  /^\|\s*`(AXM_[A-Z0-9_]+)`\s*\|\s*(stable automation|internal)\s*\|/;

const isInstaller = (file: string): boolean => file.endsWith(".sh") || file.endsWith(".ps1");

/**
 * Keep production AXM environment reads and the public environment reference
 * in exact correspondence. An exact AXM-prefixed string literal in production
 * code, or an AXM-prefixed reference in an installer shipped by the CLI, is
 * treated as an environment control and must be classified.
 */
export const findAxmEnvironmentContractViolations = (
  workspace: Workspace,
): ReadonlyArray<AxmEnvironmentContractViolation> => {
  const cli = workspace.projects.find((project) => project.name === "cli");
  const cliRoot = cli?.root ?? "apps/cli";
  const production = productionProjects(workspace);
  const sources = [
    ...typeScriptSources(workspace, production).filter(isProductionTypeScriptSource),
    ...(cli === undefined
      ? []
      : workspace
          .filesOf(cli)
          .filter(
            (file) =>
              isUnder(file, `${cliRoot}/site-content`) &&
              (file.endsWith("/install.sh") || file.endsWith("/install.ps1")),
          )),
  ];

  const sourceLocations = new Map<string, { readonly filePath: string; readonly line: number }>();
  for (const file of sources) {
    const source = workspace.read(file);
    const pattern = isInstaller(file)
      ? AXM_INSTALLER_ENVIRONMENT_REFERENCE
      : AXM_ENVIRONMENT_LITERAL;
    for (const match of source.matchAll(pattern)) {
      const variable = match[1];
      if (variable === undefined || sourceLocations.has(variable)) continue;
      sourceLocations.set(variable, { filePath: file, line: lineAtOffset(source, match.index) });
    }
  }

  const contractPath = `${cliRoot}/help/topics/environment.md`;
  if (!fs.existsSync(path.join(workspace.root, contractPath))) {
    return [
      {
        variable: "AXM_ENVIRONMENT_CONTRACT",
        filePath: contractPath,
        line: 1,
        reason: "canonical environment reference is missing",
      },
    ];
  }

  const contract = workspace.read(contractPath);
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
        filePath: contractPath,
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
        filePath: contractPath,
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

export const formatAxmEnvironmentContractViolation = (
  violation: AxmEnvironmentContractViolation,
): string => `${violation.filePath}:${violation.line} ${violation.variable}: ${violation.reason}`;

export type TestTaxonomyViolation = {
  readonly _tag: "TestTaxonomyViolation";
  readonly filePath: string;
  readonly reason: string;
};

const E2E_PROJECT_TAG = "role:e2e";

const isTestFile = (file: string): boolean => file.endsWith(".test.ts");

const statIfPresent = (absolute: string, follow: boolean): fs.Stats | undefined => {
  try {
    return follow ? fs.statSync(absolute) : fs.lstatSync(absolute);
  } catch {
    return undefined;
  }
};

/**
 * The files a project answers for: everything it owns, except that the
 * workspace-root project owns every unowned path and answers only for its
 * declared source root.
 */
const authoredFiles = (workspace: Workspace, project: WorkspaceProject): readonly string[] =>
  project.root === "" ? sourceFiles(workspace, project) : workspace.filesOf(project);

/**
 * Enforce the test-file rules that discovery relies on:
 *
 * - `*.spec.ts` exports a `specification` (checked statically) whose identity
 *   is unique across the workspace;
 * - `*.test.ts` never exports `specification`;
 * - `*.e2e.test.ts` lives only inside projects tagged `role:e2e`;
 * - neither lives inside `__generated__/`;
 * - a symbolic link may not hide test or specification files; and
 * - diagnostic benchmarks live under `benchmarks/`.
 */
export const findTestTaxonomyViolations = (
  workspace: Workspace,
): ReadonlyArray<TestTaxonomyViolation> => {
  const violations: TestTaxonomyViolation[] = [];
  const identities = new Map<string, string>();
  const violation = (filePath: string, reason: string): void => {
    violations.push({ _tag: "TestTaxonomyViolation", filePath, reason });
  };
  for (const project of workspace.projects) {
    for (const file of authoredFiles(workspace, project)) {
      const name = file.slice(file.lastIndexOf("/") + 1);
      const purpose = classifyTestPurpose(file);
      const isSpecification = isSpecificationPath(file);
      const isTest = isTestFile(file);
      const absolute = path.join(workspace.root, file);
      if (statIfPresent(absolute, false)?.isSymbolicLink() === true) {
        if (statIfPresent(absolute, true)?.isDirectory() === true || isSpecification || isTest) {
          violation(file, "symbolic links may not hide test or specification files");
          continue;
        }
      }
      if (name.endsWith(".bench.ts") && !isUnder(file, "benchmarks")) {
        violation(file, "diagnostic benchmarks live under benchmarks/");
        continue;
      }
      if ((isSpecification || isTest) && file.split("/").includes("__generated__")) {
        violation(file, "test and specification files never live inside __generated__/");
        continue;
      }
      if (purpose === "e2e" && !project.tags.includes(E2E_PROJECT_TAG)) {
        violation(file, `*.e2e.test.ts lives only inside projects tagged ${E2E_PROJECT_TAG}`);
        continue;
      }
      if (isSpecification) {
        const parsed = parseSpecificationFile(workspace.read(file), file);
        if (parsed.specification === undefined) {
          violation(
            file,
            `*.spec.ts must export a valid \`specification\`: ${parsed.issues.map((issue) => issue.message).join("; ")}`,
          );
          continue;
        }
        const identity = parsed.specification.metadata.requirement;
        const first = identities.get(identity);
        if (first !== undefined) {
          violation(
            file,
            `requirement identity \`${identity}\` is already declared by ${first}; exactly one canonical specification file per identity`,
          );
          continue;
        }
        identities.set(identity, file);
      } else if (isTest && exportsSpecification(workspace.read(file))) {
        violation(
          file,
          "*.test.ts must not export `specification`; name it *.spec.ts or drop the export",
        );
      }
    }
  }
  return violations.sort((left, right) => left.filePath.localeCompare(right.filePath));
};

export const formatTestTaxonomyViolation = (violation: TestTaxonomyViolation): string =>
  `${violation.filePath}: ${violation.reason}`;
