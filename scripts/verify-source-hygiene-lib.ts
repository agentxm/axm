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
  path.join("packages", "core", "src", "unstable", "cli-renderer", "renderer-helpers.ts"),
  path.join("packages", "core", "src", "unstable", "cli-runtime", "handle-error.ts"),
  path.join("packages", "core", "src", "unstable", "cli-runtime", "run-cli-main.ts"),
  path.join("packages", "core", "src", "unstable", "cli-runtime", "runtime-envelope.ts"),
]);

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
    path.join(repoRoot, "packages", "core", "src", "unstable"),
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

export const formatViolation = (violation: ControlByteViolation): string =>
  `${violation.filePath}:${violation.line} contains forbidden control byte 0x${violation.byte
    .toString(16)
    .padStart(2, "0")}`;

export const formatMachineOutputBoundaryViolation = (
  violation: MachineOutputBoundaryViolation,
): string =>
  `${violation.filePath}:${violation.line} uses ${violation.construct}: ${violation.reason}`;
