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

export const formatViolation = (violation: ControlByteViolation): string =>
  `${violation.filePath}:${violation.line} contains forbidden control byte 0x${violation.byte
    .toString(16)
    .padStart(2, "0")}`;
