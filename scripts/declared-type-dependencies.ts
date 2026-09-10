/**
 * Every workspace package a built `.d.ts` names must be a package its own
 * manifest declares.
 *
 * TypeScript emits a reference to whatever package a public signature happens
 * to mention, whether or not the emitting package depends on it. When the
 * emitting package does not declare that dependency, the emitted
 * `import("@agentxm/x").Y` has nothing to resolve against in a consumer's
 * install; under `skipLibCheck` the unresolved reference becomes `any`, and
 * `Y | any` collapses the whole union it sits in — so an exported Effect's
 * error and requirement channels silently widen and every consumer loses the
 * type safety the signature promised. The failure surfaces far from its cause,
 * as an unrelated build error or a missing service at runtime.
 *
 * The fix is always one of two things, never a suppression: declare the
 * dependency, or name the union explicitly so the emitter prints an alias from
 * a package that is declared.
 *
 * Only first-party `@agentxm/*` references are judged here; third-party
 * resolution is already the package manager's business.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import {
  createProjectGraphAsync,
  getOutputsForTargetAndConfiguration,
  workspaceRoot as nxWorkspaceRoot,
  type ProjectGraphProjectNode,
} from "@nx/devkit";

/** The scope whose cross-package references this guard judges. */
export const GUARDED_SCOPE = "@agentxm/";

/** One package's built declarations, as the guard reads them. */
export interface DeclarationSubject {
  /** Manifest name of the package that emitted the declarations. */
  readonly packageName: string;
  /** Repository-relative manifest path, for the failure message. */
  readonly manifestPath: string;
  /** Every package name the manifest declares as a runtime dependency. */
  readonly declared: ReadonlySet<string>;
  /** Emitted declaration files: repository-relative path and contents. */
  readonly declarations: ReadonlyArray<{ readonly path: string; readonly text: string }>;
}

/** One emitted reference to a package the emitting manifest does not declare. */
export interface UndeclaredTypeDependency {
  readonly packageName: string;
  readonly manifestPath: string;
  readonly referenced: string;
  /** Declaration files that carry the reference, sorted. */
  readonly declarations: ReadonlyArray<string>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The source with comments replaced by equivalent-length whitespace.
 *
 * Prose mentions a package name constantly — the module header of nearly every
 * file in this repository does — so a scanner that judged raw text would report
 * documentation. Replacing rather than deleting keeps offsets stable, and the
 * scan honours string and template literals so a `//` inside a URL never opens
 * a comment.
 */
export const withoutComments = (source: string): string => {
  const out: string[] = [];
  let index = 0;
  const blank = (length: number): string => " ".repeat(length);
  while (index < source.length) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (character === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out.push(blank(stop - index));
      index = stop;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out.push(source.slice(index, stop).replace(/[^\n]/gu, " "));
      index = stop;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      let cursor = index + 1;
      while (cursor < source.length) {
        const inner = source[cursor];
        if (inner === "\\") {
          cursor += 2;
          continue;
        }
        if (inner === quote) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      out.push(source.slice(index, cursor));
      index = cursor;
      continue;
    }
    out.push(character);
    index += 1;
  }
  return out.join("");
};

/** Module-specifier positions a declaration file can carry. */
const SPECIFIER_PATTERNS: ReadonlyArray<RegExp> = [
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
  /\bfrom\s*["']([^"']+)["']/gu,
  /\bimport\s*["']([^"']+)["']/gu,
  /\bdeclare\s+module\s*["']([^"']+)["']/gu,
  /\/\/\/\s*<reference\s+types\s*=\s*["']([^"']+)["']/gu,
];

/** A bare specifier's owning package name, or undefined when it is relative. */
export const owningPackage = (specifier: string): string | undefined => {
  if (specifier.startsWith(".") || specifier.startsWith("#") || specifier.startsWith("/")) {
    return undefined;
  }
  const segments = specifier.split("/");
  const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? "");
  return /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/u.test(name) ? name : undefined;
};

/**
 * Every `@agentxm/*` package a declaration file references through a module
 * specifier. Triple-slash type references count; prose does not.
 */
export const referencedGuardedPackages = (declarationText: string): ReadonlySet<string> => {
  const code = withoutComments(declarationText);
  const references = new Set<string>();
  // The reference directive lives in a comment, so it is matched separately
  // against the original text.
  for (const pattern of SPECIFIER_PATTERNS) {
    const subject = pattern.source.startsWith("\\/\\/\\/") ? declarationText : code;
    for (const match of subject.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const owner = owningPackage(specifier);
      if (owner !== undefined && owner.startsWith(GUARDED_SCOPE)) references.add(owner);
    }
  }
  return references;
};

/** Every emitted reference no manifest declares, ordered by package then reference. */
export const findUndeclaredTypeDependencies = (
  subjects: ReadonlyArray<DeclarationSubject>,
): ReadonlyArray<UndeclaredTypeDependency> => {
  const findings: UndeclaredTypeDependency[] = [];
  for (const subject of subjects) {
    const byReference = new Map<string, string[]>();
    for (const declaration of subject.declarations) {
      for (const referenced of referencedGuardedPackages(declaration.text)) {
        if (referenced === subject.packageName || subject.declared.has(referenced)) continue;
        const carriers = byReference.get(referenced) ?? [];
        carriers.push(declaration.path);
        byReference.set(referenced, carriers);
      }
    }
    for (const [referenced, carriers] of [...byReference].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      findings.push({
        packageName: subject.packageName,
        manifestPath: subject.manifestPath,
        referenced,
        declarations: [...carriers].sort(),
      });
    }
  }
  return findings;
};

/** The one sentence a finding fails with. */
export const describeUndeclaredTypeDependency = (finding: UndeclaredTypeDependency): string =>
  [
    `${finding.packageName} emits a reference to ${finding.referenced}, which ${finding.manifestPath} does not declare`,
    ...finding.declarations.map((declaration) => `    ${declaration}`),
    `    Declare the dependency, or name the union explicitly so the emitted signature`,
    `    prints an alias from a package this one already declares.`,
  ].join("\n");

const declaredDependencies = (manifest: Record<string, unknown>): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const value = manifest[field];
    if (isRecord(value)) for (const name of Object.keys(value)) names.add(name);
  }
  return names;
};

const declarationFilesIn = (directory: string, found: string[] = []): string[] => {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) declarationFilesIn(child, found);
    else if (entry.name.endsWith(".d.ts")) found.push(child);
  }
  return found;
};

/** Directories one project's `build` target writes, as Nx resolves them. */
const buildOutputsOf = (node: ProjectGraphProjectNode): ReadonlyArray<string> => {
  const target = node.data.targets?.["build"];
  if (target === undefined) return [];
  return getOutputsForTargetAndConfiguration({ project: node.name, target: "build" }, {}, node)
    .map((output) => output.replace(/[\\/]+$/u, ""))
    .filter((output) => !/[{}*]/u.test(output));
};

/**
 * Every buildable project's emitted declarations, read from the outputs its
 * `build` target declares. A project whose output is absent is reported as
 * unbuilt rather than silently passing.
 */
export const readBuiltDeclarationSubjects = async (
  root: string = nxWorkspaceRoot,
): Promise<{
  readonly subjects: ReadonlyArray<DeclarationSubject>;
  readonly unbuilt: ReadonlyArray<string>;
}> => {
  const graph = await createProjectGraphAsync({ exitOnError: false });
  const subjects: DeclarationSubject[] = [];
  const unbuilt: string[] = [];
  for (const node of Object.values(graph.nodes).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const outputs = buildOutputsOf(node);
    if (outputs.length === 0) continue;
    const manifestPath = join(node.data.root, "package.json");
    const absoluteManifest = join(root, manifestPath);
    if (!existsSync(absoluteManifest)) continue;
    const parsed: unknown = JSON.parse(readFileSync(absoluteManifest, "utf8"));
    if (!isRecord(parsed) || typeof parsed["name"] !== "string") continue;
    // An output directory that is not there means the project was never
    // built, and a guard that skipped it would pass on nothing. One that is
    // there but carries no declarations is ordinary: an application build
    // emits runtime files only.
    if (!outputs.some((output) => existsSync(join(root, output)))) {
      unbuilt.push(node.name);
      continue;
    }
    const files = outputs.flatMap((output) => declarationFilesIn(join(root, output)));
    subjects.push({
      packageName: parsed["name"],
      manifestPath,
      declared: declaredDependencies(parsed),
      declarations: files.map((file) => ({
        path: relative(root, file).replaceAll("\\", "/"),
        text: readFileSync(file, "utf8"),
      })),
    });
  }
  return { subjects, unbuilt };
};
