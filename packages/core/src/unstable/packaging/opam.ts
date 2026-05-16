/**
 * opam (OCaml) package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageURL } from "packageurl-js";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const opamType = Schema.decodeUnknownSync(PackageTypeSchema)("opam");
const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

/**
 * Read a file as string, returning Option.none for NotFound and other errors.
 */
const readFileOptional = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(Effect.option);
    return content;
  });

/** Build-tooling dependencies to skip. */
const SKIP_DEPS = new Set(["ocaml", "dune"]);

/**
 * Parse opam depends field content.
 * Format: depends: [ "pkg1" {>= "ver"} "pkg2" ... ]
 * The constraint syntax uses { } for version constraints.
 */
const parseOpamDepends = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Find the depends field - it starts with "depends:" and contains a [ ... ] block
  const dependsRegex = /depends:\s*\[([^\]]*)\]/s;
  const match = dependsRegex.exec(content);
  if (match === null || match[1] === undefined) return [];

  // Extract quoted package names and their optional version constraints
  // Pattern: "name" {constraint} or just "name"
  const entryRegex = /"([^"]+)"(?:\s*\{([^}]*)\})?/g;
  let entryMatch: RegExpExecArray | null;

  while ((entryMatch = entryRegex.exec(match[1])) !== null) {
    const name = entryMatch[1];
    const constraint = entryMatch[2]?.trim();
    if (name === undefined) continue;
    if (SKIP_DEPS.has(name)) continue;

    // Check for exact version: = "version"
    let version: string | undefined;
    if (constraint !== undefined) {
      const exactMatch = /^=\s*"([^"]+)"$/.exec(constraint);
      if (exactMatch?.[1]) {
        version = exactMatch[1];
      }
    }

    const purl = new PackageURL("opam", null, name, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());
    results.push({ purl: purlParts, type: opamType, source });
  }

  return results;
};

/**
 * Extract the contents of a top-level `(depends ...)` s-expression
 * by finding the opening `(depends` and then walking to the matching
 * closing `)` while counting nested parentheses.
 */
const extractDependsBlock = (content: string): string | undefined => {
  const idx = content.indexOf("(depends");
  if (idx === -1) return undefined;

  // Move past "(depends"
  let i = idx + "(depends".length;
  let depth = 1;
  const start = i;

  while (i < content.length && depth > 0) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") depth--;
    i++;
  }

  // depth === 0 means we found the matching close paren
  if (depth !== 0) return undefined;
  // Return everything between "(depends" and the matching ")"
  return content.slice(start, i - 1);
};

/**
 * Parse dune-project (depends ...) s-expression.
 * Format: (depends (ocaml (>= 5.0)) (lwt (>= 5.0)) yojson)
 */
const parseDuneProjectDepends = (
  content: string,
  source: string,
): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  const depsBlock = extractDependsBlock(content);
  if (depsBlock === undefined) return [];

  const depsContent = depsBlock;

  // Extract dependency entries: (name constraint) or bare name
  // A dependency can be: bare_name, (name constraint_expr)
  const entries: Array<string> = [];

  // Parse the s-expression content to extract dependency names
  let i = 0;
  while (i < depsContent.length) {
    // Skip whitespace
    while (i < depsContent.length && /\s/.test(depsContent[i] ?? "")) i++;
    if (i >= depsContent.length) break;

    if (depsContent[i] === "(") {
      // Parenthesized entry - extract the name (first atom)
      i++; // skip (
      // Skip whitespace
      while (i < depsContent.length && /\s/.test(depsContent[i] ?? "")) i++;

      // Read the name
      let name = "";
      while (i < depsContent.length && !/[\s)]/.test(depsContent[i] ?? "")) {
        name += depsContent[i];
        i++;
      }

      // Check for exact version constraint: (= version)
      let version: string | undefined;
      const remaining = depsContent.slice(i);
      const exactMatch = /^\s*\(\s*=\s*(\S+)\s*\)/.exec(remaining);
      if (exactMatch?.[1]) {
        version = exactMatch[1];
      }

      if (name !== "") {
        entries.push(name);
        if (version !== undefined && !SKIP_DEPS.has(name)) {
          const purl = new PackageURL("opam", null, name, version, null, null);
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: opamType, source });
          // Skip to closing paren
          let depth = 1;
          while (i < depsContent.length && depth > 0) {
            if (depsContent[i] === "(") depth++;
            else if (depsContent[i] === ")") depth--;
            i++;
          }
          continue;
        }
      }

      // Skip to closing paren
      let depth = 1;
      while (i < depsContent.length && depth > 0) {
        if (depsContent[i] === "(") depth++;
        else if (depsContent[i] === ")") depth--;
        i++;
      }

      if (name !== "" && !SKIP_DEPS.has(name) && version === undefined) {
        const purl = new PackageURL("opam", null, name, null, null, null);
        const purlParts = decodePurl(purl.toString());
        results.push({ purl: purlParts, type: opamType, source });
      }
    } else {
      // Bare name
      let name = "";
      while (i < depsContent.length && !/[\s)]/.test(depsContent[i] ?? "")) {
        name += depsContent[i];
        i++;
      }

      if (name !== "" && !SKIP_DEPS.has(name)) {
        const purl = new PackageURL("opam", null, name, null, null, null);
        const purlParts = decodePurl(purl.toString());
        results.push({ purl: purlParts, type: opamType, source });
      }
    }
  }

  return results;
};

/**
 * opam package detector.
 *
 * Scans `*.opam` files for `depends` fields and `dune-project` for
 * `(depends ...)` s-expressions. Skips `ocaml` and `dune` build tooling.
 * Dependencies are deduplicated by name.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const opamDetector: PackageDetector = {
  type: opamType,
  detect: Effect.fn("detect.opam")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const allDeps: Array<DetectedPackage> = [];
      const seenNames = new Set<string>();

      const addDeps = (deps: ReadonlyArray<DetectedPackage>): void => {
        for (const dep of deps) {
          if (!seenNames.has(dep.purl.name)) {
            seenNames.add(dep.purl.name);
            allDeps.push(dep);
          }
        }
      };

      // Scan for *.opam files
      const entries = yield* fs.readDirectory(projectDir).pipe(Effect.option);
      if (Option.isSome(entries)) {
        const opamFiles = entries.value.filter((e) => e.endsWith(".opam"));
        for (const opamFile of opamFiles) {
          const filePath = path.join(projectDir, opamFile);
          const content = yield* readFileOptional(filePath);
          if (Option.isSome(content)) {
            const deps = parseOpamDepends(content.value, filePath);
            if (deps.length === 0 && content.value.trim().length > 0) {
              if (!content.value.includes("opam-version:") && !content.value.includes("name:")) {
                yield* Effect.logWarning(`Malformed opam file: ${opamFile}, skipping`);
              }
            }
            addDeps(deps);
          }
        }
      }

      // Parse dune-project
      const dunePath = path.join(projectDir, "dune-project");
      const duneContent = yield* readFileOptional(dunePath);
      if (Option.isSome(duneContent)) {
        const duneDeps = parseDuneProjectDepends(duneContent.value, dunePath);
        addDeps(duneDeps);
      }

      return allDeps;
    },
    Effect.annotateLogs({ detector: "opam" }),
    Effect.withSpan("detect.opam"),
  ),
};

/**
 * Parse x-axm custom fields from opam file content.
 * Returns a record mapping field names (without x-axm- prefix) to values.
 */
const parseXAxmFields = (content: string): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  const regex = /^x-axm-(\S+)\s*:\s*(.+)$/gim;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const fieldName = match[1];
    const rawValue = match[2]?.trim();
    if (fieldName === undefined || rawValue === undefined) continue;

    // Try to parse as JSON value (for arrays, etc.)
    try {
      fields[fieldName] = JSON.parse(rawValue);
    } catch {
      fields[fieldName] = rawValue;
    }
  }

  return fields;
};

/**
 * opam package reader.
 *
 * Reads `x-axm` prefixed custom fields from `.opam` files in the
 * opam switch at `~/.opam/<switch>/lib/<pkg>/opam`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const opamReader: PackageReader = {
  type: opamType,
  read: Effect.fn("read.opam")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const pkgName = pkg.purl.name;
      const home = os.homedir();

      const opamDir = path.join(home, ".opam");

      // List available switches
      const switches = yield* fs.readDirectory(opamDir).pipe(Effect.option);
      if (Option.isNone(switches)) return Option.none();

      // Check each switch for the package
      for (const switchName of switches.value) {
        const opamFilePath = path.join(opamDir, switchName, "lib", pkgName, "opam");
        const content = yield* readFileOptional(opamFilePath);
        if (Option.isNone(content)) continue;

        const xAxmFields = parseXAxmFields(content.value);
        if (Object.keys(xAxmFields).length === 0) continue;

        const metaResult = decodeAxmMeta(xAxmFields);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(`Invalid axm metadata in ${pkgName}: schema validation failed`);
          return Option.none();
        }

        return Option.some(metaResult.success.extensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "opam" }),
    Effect.withSpan("read.opam"),
  ),
};
