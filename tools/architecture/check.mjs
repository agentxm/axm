import { cruise } from "dependency-cruiser";
import { resolve } from "node:path";
import { cycleRootPath, cycleRoots, sliceFolder } from "./config.mjs";

const result = await cruise(cycleRoots, {
  baseDir: resolve(import.meta.dirname, "../.."),
  outputType: "json",
  validate: true,
  tsPreCompilationDeps: true,
  doNotFollow: { path: "node_modules" },
  exclude: {
    path: "\\.(test|spec|shared-spec)\\.[cm]?[jt]sx?$|(^|/)(test-support|__fixtures__|testing)(/|$)|(^|/)(test-helpers|testing)\\.[cm]?[jt]sx?$",
  },
  enhancedResolveOptions: {
    conditionNames: ["axm-source", "import", "node", "default"],
    exportsFields: ["exports"],
  },
  ruleSet: {
    forbidden: [
      {
        name: "no-file-cycles",
        severity: "error",
        from: { path: cycleRootPath },
        to: { circular: true },
      },
      { name: "no-unresolved-imports", severity: "error", from: {}, to: { couldNotResolve: true } },
      {
        name: "no-slice-cycles",
        severity: "error",
        scope: "folder",
        from: { path: sliceFolder },
        to: { path: sliceFolder, circular: true },
      },
    ],
  },
});
const report = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
for (const violation of report.summary.violations) {
  const via = violation.cycle?.map(({ name }) => name).join(" -> ");
  console.error(
    `${violation.rule.name}: ${violation.from} -> ${violation.to}${via ? ` (via ${via})` : ""}`,
  );
}
if (report.summary.error > 0) process.exitCode = 1;
else
  console.log(
    `Architecture graph passed: ${report.modules.filter((module) => !module.matchesDoNotFollow).length} source modules; no file or slice cycles.`,
  );
