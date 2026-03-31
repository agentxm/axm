import * as fs from "node:fs";
import * as path from "node:path";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const satisfies ReadonlyArray<string>;

const FORBIDDEN_PACKAGE_NAMES = [
  "@axm.sh/core",
  "@axm.sh/cli",
  "@axm.sh/cli-spike",
] as const satisfies ReadonlyArray<string>;

const FORBIDDEN_PROJECT_ROOTS = [
  "packages/core",
  "packages/cli",
  "packages/cli-spike",
] as const satisfies ReadonlyArray<string>;

export type BoundaryRule = {
  readonly projectRoot: string;
  readonly forbiddenPackageNames: ReadonlyArray<string>;
  readonly forbiddenProjectRoots: ReadonlyArray<string>;
};

export type PackageDependencyViolation = {
  readonly _tag: "PackageDependencyViolation";
  readonly projectRoot: string;
  readonly packageJsonPath: string;
  readonly dependencyField: string;
  readonly packageName: string;
};

export type TsconfigReferenceViolation = {
  readonly _tag: "TsconfigReferenceViolation";
  readonly projectRoot: string;
  readonly tsconfigPath: string;
  readonly referencePath: string;
  readonly referencedProjectRoot: string;
};

export type BoundaryViolation = PackageDependencyViolation | TsconfigReferenceViolation;

export const DEFAULT_BOUNDARY_RULES = [
  {
    projectRoot: "packages/e2e-utils",
    forbiddenPackageNames: FORBIDDEN_PACKAGE_NAMES,
    forbiddenProjectRoots: FORBIDDEN_PROJECT_ROOTS,
  },
  {
    projectRoot: "packages/cli-e2e",
    forbiddenPackageNames: FORBIDDEN_PACKAGE_NAMES,
    forbiddenProjectRoots: FORBIDDEN_PROJECT_ROOTS,
  },
  {
    projectRoot: "packages/cli-spike-e2e",
    forbiddenPackageNames: FORBIDDEN_PACKAGE_NAMES,
    forbiddenProjectRoots: FORBIDDEN_PROJECT_ROOTS,
  },
] as const satisfies ReadonlyArray<BoundaryRule>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const normalizePath = (value: string): string => value.split(path.sep).join("/");

const readJsonFile = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

const getInternalDependencyViolations = (
  repoRoot: string,
  rule: BoundaryRule,
): ReadonlyArray<PackageDependencyViolation> => {
  const packageJsonPath = path.join(repoRoot, rule.projectRoot, "package.json");
  const packageJson = readJsonFile(packageJsonPath);

  if (!isRecord(packageJson)) {
    throw new Error(`${normalizePath(path.relative(repoRoot, packageJsonPath))} must contain an object`);
  }

  const violations: PackageDependencyViolation[] = [];

  for (const dependencyField of DEPENDENCY_FIELDS) {
    const dependencyGroup = packageJson[dependencyField];

    if (!isRecord(dependencyGroup)) {
      continue;
    }

    for (const packageName of Object.keys(dependencyGroup)) {
      if (!rule.forbiddenPackageNames.includes(packageName)) {
        continue;
      }

      violations.push({
        _tag: "PackageDependencyViolation",
        projectRoot: rule.projectRoot,
        packageJsonPath: normalizePath(path.relative(repoRoot, packageJsonPath)),
        dependencyField,
        packageName,
      });
    }
  }

  return violations;
};

const getPackageProjectRoot = (repoRoot: string, absolutePath: string): string | null => {
  const relativePath = normalizePath(path.relative(repoRoot, absolutePath));

  if (relativePath.startsWith("../") || relativePath === "..") {
    return null;
  }

  const segments = relativePath.split("/");

  if (segments.length < 2 || segments[0] !== "packages") {
    return null;
  }

  const packageName = segments[1];

  if (packageName == null || packageName.length === 0) {
    return null;
  }

  return `packages/${packageName}`;
};

const findTsconfigFiles = (directoryPath: string): ReadonlyArray<string> => {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const matches: string[] = [];

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      matches.push(...findTsconfigFiles(entryPath));
      continue;
    }

    if (entry.isFile() && /^tsconfig(\..+)?\.json$/.test(entry.name)) {
      matches.push(entryPath);
    }
  }

  return matches;
};

const getTsconfigReferenceViolations = (
  repoRoot: string,
  rule: BoundaryRule,
): ReadonlyArray<TsconfigReferenceViolation> => {
  const projectPath = path.join(repoRoot, rule.projectRoot);
  const tsconfigFiles = findTsconfigFiles(projectPath);
  const violations: TsconfigReferenceViolation[] = [];

  for (const tsconfigPath of tsconfigFiles) {
    const tsconfig = readJsonFile(tsconfigPath);

    if (!isRecord(tsconfig)) {
      throw new Error(`${normalizePath(path.relative(repoRoot, tsconfigPath))} must contain an object`);
    }

    const references = tsconfig["references"];

    if (!Array.isArray(references)) {
      continue;
    }

    for (const reference of references) {
      if (!isRecord(reference)) {
        continue;
      }

      const referencePath = reference["path"];

      if (typeof referencePath !== "string") {
        continue;
      }

      const resolvedPath = path.resolve(path.dirname(tsconfigPath), referencePath);
      const referencedProjectRoot = getPackageProjectRoot(repoRoot, resolvedPath);

      if (referencedProjectRoot === null) {
        continue;
      }

      if (!rule.forbiddenProjectRoots.includes(referencedProjectRoot)) {
        continue;
      }

      violations.push({
        _tag: "TsconfigReferenceViolation",
        projectRoot: rule.projectRoot,
        tsconfigPath: normalizePath(path.relative(repoRoot, tsconfigPath)),
        referencePath,
        referencedProjectRoot,
      });
    }
  }

  return violations;
};

export const findBoundaryViolations = (
  repoRoot: string,
  rules: ReadonlyArray<BoundaryRule> = DEFAULT_BOUNDARY_RULES,
): ReadonlyArray<BoundaryViolation> =>
  rules.flatMap((rule) => [
    ...getInternalDependencyViolations(repoRoot, rule),
    ...getTsconfigReferenceViolations(repoRoot, rule),
  ]);

export const formatViolation = (violation: BoundaryViolation): string => {
  switch (violation._tag) {
    case "PackageDependencyViolation":
      return `${violation.packageJsonPath}: ${violation.dependencyField} must not include ${violation.packageName}`;
    case "TsconfigReferenceViolation":
      return `${violation.tsconfigPath}: reference "${violation.referencePath}" resolves to forbidden project ${violation.referencedProjectRoot}`;
  }
};
