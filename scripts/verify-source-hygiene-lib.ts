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

export type DiscoveredProject = {
  /** Repository-relative project root with forward slashes; `""` for the root project. */
  readonly root: string;
  readonly name: string | undefined;
  readonly tags: ReadonlyArray<string>;
};

/** Directory families that may hold authored projects. */
const PROJECT_FAMILIES = ["apps", "packages", "tools", "specifications"] as const;

const RUNTIME_ROLE_TAGS: ReadonlySet<string> = new Set([
  "role:contract",
  "role:capability",
  "role:feature",
  "role:integration",
  "role:application",
]);

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

const readProject = (repoRoot: string, projectJsonPath: string): DiscoveredProject => {
  const parsed: unknown = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"));
  const record = typeof parsed === "object" && parsed !== null ? parsed : {};
  const name = "name" in record ? record.name : undefined;
  const tags = "tags" in record && Array.isArray(record.tags) ? record.tags : [];
  return {
    root: path.relative(repoRoot, path.dirname(projectJsonPath)).split(path.sep).join("/"),
    name: typeof name === "string" ? name : undefined,
    tags: tags.filter((tag: unknown): tag is string => typeof tag === "string"),
  };
};

/**
 * Every Nx project the repository authors, discovered from its `project.json`
 * under `apps/`, `packages/`, `tools/`, and `specifications` plus the root
 * project. Discovery never assumes a directory depth, so a package moved
 * between tiers can neither escape a scan nor be scanned twice.
 */
export const discoverProjects = (repoRoot: string): ReadonlyArray<DiscoveredProject> => {
  const projects: DiscoveredProject[] = [];
  const rootProjectPath = path.join(repoRoot, "project.json");
  if (fs.existsSync(rootProjectPath)) {
    projects.push(readProject(repoRoot, rootProjectPath));
  }
  for (const family of PROJECT_FAMILIES) {
    const familyPath = path.join(repoRoot, family);
    if (!fs.existsSync(familyPath)) continue;
    const files: string[] = [];
    walkFiles(familyPath, files);
    for (const filePath of files) {
      if (path.basename(filePath) === "project.json") {
        projects.push(readProject(repoRoot, filePath));
      }
    }
  }
  return projects.sort((left, right) => left.root.localeCompare(right.root));
};

const projectSourceRoots = (
  repoRoot: string,
  projects: ReadonlyArray<DiscoveredProject>,
): ReadonlyArray<string> =>
  projects
    .filter((project) => project.root !== "")
    .map((project) => path.join(repoRoot, project.root, "src"))
    .filter((srcRoot) => fs.existsSync(srcRoot));

/**
 * Scan every authored project's `src/**` TypeScript source under `repoRoot`
 * for forbidden C0 control bytes.
 */
export const findSourceHygieneViolations = (
  repoRoot: string,
): ReadonlyArray<ControlByteViolation> => {
  const sourceFiles: string[] = [];
  for (const srcRoot of projectSourceRoots(repoRoot, discoverProjects(repoRoot))) {
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

const lineAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length;

/**
 * Production package source roots, derived from the discovered projects so a
 * package extraction never leaves a scanner behind. A project is production
 * when it declares a runtime `role:*`; e2e and tooling projects observe
 * published artifacts and own no production literals.
 */
const productionPackageSourceRoots = (
  repoRoot: string,
  projects: ReadonlyArray<DiscoveredProject>,
): ReadonlyArray<string> =>
  projectSourceRoots(
    repoRoot,
    projects.filter((project) => project.tags.some((tag) => RUNTIME_ROLE_TAGS.has(tag))),
  );

const UNBOUNDED_CONCURRENCY_LITERAL = /concurrency\s*:\s*["']unbounded["']/g;

/**
 * Count the reviewed production baseline of literal unbounded traversals.
 * The caller treats this as a ratchet: removals lower the recorded ceiling;
 * additions must classify the workload instead of spending that headroom.
 */
export const countUnboundedConcurrencySites = (repoRoot: string): number => {
  const sourceFiles: string[] = [];
  for (const srcRoot of projectSourceRoots(repoRoot, discoverProjects(repoRoot))) {
    walkTypeScriptSources(srcRoot, sourceFiles);
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
const AXM_INSTALLER_ENVIRONMENT_REFERENCE = /\b(AXM_[A-Z0-9_]+)\b/g;
const AXM_ENVIRONMENT_CONTRACT_ROW =
  /^\|\s*`(AXM_[A-Z0-9_]+)`\s*\|\s*(stable automation|internal)\s*\|/;

/**
 * Keep production AXM environment reads and the public environment reference
 * in exact correspondence. An exact AXM-prefixed string literal in CLI or core
 * production code, or an AXM-prefixed reference in an installer, is treated as
 * an environment control and must be classified.
 */
export const findAxmEnvironmentContractViolations = (
  repoRoot: string,
): ReadonlyArray<AxmEnvironmentContractViolation> => {
  const projects = discoverProjects(repoRoot);
  const cliRoot = projects.find((project) => project.name === "cli")?.root ?? "apps/cli";
  const sourceFiles: string[] = [];
  for (const root of productionPackageSourceRoots(repoRoot, projects)) {
    walkTypeScriptSources(root, sourceFiles);
  }
  for (const installer of [
    path.join(repoRoot, cliRoot, "site-content", "install.sh"),
    path.join(repoRoot, cliRoot, "site-content", "install.ps1"),
  ]) {
    if (fs.existsSync(installer)) sourceFiles.push(installer);
  }

  const sourceLocations = new Map<string, { readonly filePath: string; readonly line: number }>();
  for (const filePath of sourceFiles.filter((candidate) => {
    if (candidate.endsWith(".sh") || candidate.endsWith(".ps1")) return true;
    return isProductionTypeScriptSource(candidate);
  })) {
    const source = fs.readFileSync(filePath, "utf8");
    const pattern =
      filePath.endsWith(".sh") || filePath.endsWith(".ps1")
        ? AXM_INSTALLER_ENVIRONMENT_REFERENCE
        : AXM_ENVIRONMENT_LITERAL;
    for (const match of source.matchAll(pattern)) {
      const variable = match[1];
      if (variable === undefined || sourceLocations.has(variable)) continue;
      sourceLocations.set(variable, {
        filePath: path.relative(repoRoot, filePath),
        line: lineAtOffset(source, match.index),
      });
    }
  }

  const contractPath = path.join(repoRoot, cliRoot, "help", "topics", "environment.md");
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

export const formatAxmEnvironmentContractViolation = (
  violation: AxmEnvironmentContractViolation,
): string => `${violation.filePath}:${violation.line} ${violation.variable}: ${violation.reason}`;

export type TestTaxonomyViolation = {
  readonly _tag: "TestTaxonomyViolation";
  readonly filePath: string;
  readonly reason: string;
};

const E2E_TEST_SUFFIX = ".e2e.test.ts";
const E2E_PROJECT_TAG = "type:e2e";

/** Tags of the innermost project whose root contains `relativePath`, if any. */
const owningProjectTags = (
  projects: ReadonlyMap<string, ReadonlyArray<string>>,
  relativePath: string,
): ReadonlyArray<string> | undefined => {
  let owner: string | undefined;
  for (const projectRoot of projects.keys()) {
    const prefix = projectRoot === "" ? "" : `${projectRoot}/`;
    if (
      relativePath.startsWith(prefix) &&
      (owner === undefined || projectRoot.length > owner.length)
    ) {
      owner = projectRoot;
    }
  }
  return owner === undefined ? undefined : projects.get(owner);
};

/**
 * Enforce the test-purpose filename taxonomy: `*.e2e.test.ts` lives only inside
 * projects tagged `type:e2e`, and diagnostic benchmarks live under
 * `benchmarks/`. Every other `*.test.ts` is an ordinary test colocated with its
 * source, and `*.spec.ts` may live in any authored project.
 */
export const findTestTaxonomyViolations = (
  repoRoot: string,
): ReadonlyArray<TestTaxonomyViolation> => {
  const violations: TestTaxonomyViolation[] = [];
  const files: string[] = [];
  for (const root of ["apps", "packages", "scripts", "tools"]) {
    const rootPath = path.join(repoRoot, root);
    if (fs.existsSync(rootPath)) {
      walkFiles(rootPath, files);
    }
  }
  const projects = new Map(
    discoverProjects(repoRoot).map((project) => [project.root, project.tags] as const),
  );
  for (const filePath of files) {
    const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
    const name = path.basename(filePath);
    if (name.endsWith(".bench.ts")) {
      violations.push({
        _tag: "TestTaxonomyViolation",
        filePath: relativePath,
        reason: "diagnostic benchmarks live under benchmarks/",
      });
      continue;
    }
    if (
      name.endsWith(E2E_TEST_SUFFIX) &&
      !(owningProjectTags(projects, relativePath)?.includes(E2E_PROJECT_TAG) ?? false)
    ) {
      violations.push({
        _tag: "TestTaxonomyViolation",
        filePath: relativePath,
        reason: `*${E2E_TEST_SUFFIX} lives only inside projects tagged ${E2E_PROJECT_TAG}`,
      });
    }
  }
  return violations.sort((left, right) => left.filePath.localeCompare(right.filePath));
};

export const formatTestTaxonomyViolation = (violation: TestTaxonomyViolation): string =>
  `${violation.filePath}: ${violation.reason}`;
