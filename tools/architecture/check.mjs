import { cruise } from "dependency-cruiser";
import { resolve } from "node:path";
import { capabilityCycles } from "./cycles.mjs";
import { capabilityElements, capabilityFileDescriptors, capabilityRoots } from "./config.mjs";

const result = await cruise(capabilityRoots, {
  baseDir: resolve(import.meta.dirname, "../.."),
  outputType: "json",
  validate: true,
  tsPreCompilationDeps: true,
  doNotFollow: { path: "node_modules" },
  exclude: {
    path: "\\.(test|spec|shared-spec)\\.[cm]?[jt]sx?$|(^|/)(test-support|__fixtures__)(/|$)|(^|/)(test-helpers|testing)\\.[cm]?[jt]sx?$",
  },
  enhancedResolveOptions: {
    conditionNames: ["axm-source", "import", "node", "default"],
    exportsFields: ["exports"],
  },
  ruleSet: {
    forbidden: [
      { name: "no-file-cycles", severity: "error", from: {}, to: { circular: true } },
      { name: "no-unresolved-imports", severity: "error", from: {}, to: { couldNotResolve: true } },
    ],
  },
});
const report = typeof result.output === "string" ? JSON.parse(result.output) : result.output;
const cycles = capabilityCycles(
  report.modules,
  resolve(import.meta.dirname, "../.."),
  capabilityElements,
  capabilityFileDescriptors,
);
for (const violation of report.summary.violations) {
  console.error(`${violation.rule.name}: ${violation.from} -> ${violation.to}`);
}
for (const members of cycles) console.error(`Capability cycle: ${members.join(", ")}`);
if (report.summary.error > 0 || cycles.length > 0) process.exitCode = 1;
else
  console.log(
    `Architecture graph passed: ${report.modules.filter((module) => !module.matchesDoNotFollow).length} source modules; no file or capability cycles.`,
  );
