/**
 * Verify that every runtime export in package.json points at a real dist file.
 *
 * Usage:
 *   bun scripts/verify-build-outputs.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

type ExportedBuildFile = {
  readonly exportPath: string;
  readonly relativePath: string;
};

type OrphanedSourceMap = {
  readonly relativePath: string;
  readonly expectedJsPath: string;
};

const ROOT = path.join(import.meta.dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const DIST_PATH = path.join(ROOT, "dist");

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getDefaultExportTarget = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  const defaultTarget = value["default"];
  return typeof defaultTarget === "string" ? defaultTarget : null;
};

const packageJsonContent = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
const packageJson = JSON.parse(packageJsonContent);

if (!isRecord(packageJson)) {
  fail("packages/core/package.json must parse to an object");
}

const exportsField = packageJson["exports"];

if (!isRecord(exportsField)) {
  fail("packages/core/package.json must define an object-valued exports field");
}

const exportedBuildFiles: ExportedBuildFile[] = Object.entries(exportsField).flatMap(
  ([exportPath, value]) => {
    const defaultTarget = getDefaultExportTarget(value);

    if (defaultTarget === null || !defaultTarget.startsWith("./dist/")) {
      return [];
    }

    return [{ exportPath, relativePath: defaultTarget }];
  },
);

if (exportedBuildFiles.length === 0) {
  fail("No dist-backed exports found in packages/core/package.json");
}

const missingFiles = exportedBuildFiles.filter(({ relativePath }) => {
  const absolutePath = path.join(ROOT, relativePath);
  return !fs.existsSync(absolutePath);
});

const findJavaScriptSourceMaps = (directoryPath: string): ReadonlyArray<string> => {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const sourceMaps: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      sourceMaps.push(...findJavaScriptSourceMaps(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js.map")) {
      sourceMaps.push(entryPath);
    }
  }

  return sourceMaps;
};

const orphanedSourceMaps: ReadonlyArray<OrphanedSourceMap> = findJavaScriptSourceMaps(DIST_PATH)
  .map((absoluteSourceMapPath) => {
    const absoluteJsPath = absoluteSourceMapPath.slice(0, -".map".length);
    return {
      relativePath: path.relative(ROOT, absoluteSourceMapPath),
      expectedJsPath: path.relative(ROOT, absoluteJsPath),
    };
  })
  .filter(({ expectedJsPath }) => !fs.existsSync(path.join(ROOT, expectedJsPath)));

if (missingFiles.length > 0 || orphanedSourceMaps.length > 0) {
  console.error("Invalid build outputs:");
  for (const { exportPath, relativePath } of missingFiles) {
    console.error(`  ${exportPath} -> ${relativePath}`);
  }
  for (const { relativePath, expectedJsPath } of orphanedSourceMaps) {
    console.error(`  ${relativePath} -> missing ${expectedJsPath}`);
  }
  process.exit(1);
}

console.log(`Verified ${exportedBuildFiles.length} exported build outputs.`);
