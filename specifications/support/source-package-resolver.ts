/** Resolve workspace package exports to their declared source entrypoints. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const packageDirectories = fileURLToPath(new URL("../../packages/", import.meta.url));

const sourceExports = new Map<string, string>();

for (const directoryName of readdirSync(packageDirectories)) {
  const directory = join(packageDirectories, directoryName);
  const manifestPath = join(directory, "package.json");
  if (!existsSync(manifestPath)) continue;
  const document: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(document) || typeof document["name"] !== "string") continue;
  const exports = document["exports"];
  if (!isRecord(exports)) continue;

  for (const [subpath, conditions] of Object.entries(exports)) {
    if (!isRecord(conditions)) continue;
    const declaredSource = conditions["axm-source"];
    const defaultSource = conditions["default"];
    const relative =
      typeof declaredSource === "string"
        ? declaredSource
        : typeof defaultSource === "string" && defaultSource.endsWith(".ts")
          ? defaultSource
          : undefined;
    if (relative === undefined) continue;
    const specifier =
      subpath === "." ? document["name"] : `${document["name"]}/${subpath.replace(/^\.\//u, "")}`;
    const target = join(directory, relative);
    if (existsSync(target)) sourceExports.set(specifier, target);
  }
}

/** Return the exact source file for a declared workspace-package export. */
export const resolveWorkspaceSourceSpecifier = (specifier: string): string | undefined =>
  sourceExports.get(specifier);
