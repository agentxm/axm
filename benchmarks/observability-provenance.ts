/** Hash the executed harness's complete statically resolvable module closure. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire, isBuiltin } from "node:module";
import * as ts from "typescript";
import { digest } from "./observability-process.js";

export const harnessProvenance = (repoRoot: string, entry: string) => {
  const pending = [path.resolve(repoRoot, entry)];
  const seen = new Set<string>();
  const modules: Array<{ path: string; sha256: string; bytes: number }> = [];
  const unavailable: Array<{ importer: string; specifier: string }> = [];
  for (let index = 0; index < pending.length; index++) {
    const candidate = pending[index];
    if (candidate === undefined || pending.length > 30_000)
      throw new Error("Harness module inventory exceeded its bound.");
    const file = fs.realpathSync(candidate);
    if (seen.has(file)) continue;
    seen.add(file);
    const bytes = fs.readFileSync(file);
    modules.push({
      path: path.relative(repoRoot, file),
      sha256: digest(bytes),
      bytes: bytes.length,
    });
    if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
    const require = createRequire(file);
    for (const reference of ts.preProcessFile(bytes.toString("utf8"), true, true).importedFiles) {
      const specifier = reference.fileName;
      if (isBuiltin(specifier) || specifier === "bun" || specifier.startsWith("bun:")) continue;
      if (specifier.startsWith(".")) {
        const imported = path.resolve(path.dirname(file), specifier);
        const resolved = [
          imported,
          imported.replace(/\.js$/u, ".ts"),
          imported.replace(/\.mjs$/u, ".mts"),
          imported + ".ts",
          path.join(imported, "index.ts"),
        ].find((name) => fs.existsSync(name) && fs.statSync(name).isFile());
        if (resolved !== undefined) {
          pending.push(resolved);
          continue;
        }
      }
      try {
        pending.push(require.resolve(specifier));
      } catch (cause) {
        // Native dependency loaders mention every supported platform. Preserve
        // absent references explicitly; missing first-party modules remain fatal.
        if (!file.includes(path.sep + "node_modules" + path.sep)) throw cause;
        unavailable.push({ importer: path.relative(repoRoot, file), specifier });
      }
    }
  }
  modules.sort((left, right) => left.path.localeCompare(right.path));
  unavailable.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { sha256: digest(JSON.stringify({ modules, unavailable })), modules, unavailable };
};
