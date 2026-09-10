/**
 * Run executable specifications, optionally selected by stable requirement
 * identity, then enforce the fast-suite performance budget.
 *
 * Usage:
 *   bun test-spec.ts                                     # every specification, in its owner's test target
 *   bun test-spec.ts --requirement <id> [<id> ...]       # exactly the evidence for these requirements
 *   bun test-spec.ts --class <class>                     # every specification of one review lens
 *   bun test-spec.ts --characteristic <characteristic>   # every specification measuring one characteristic
 *
 * Selection arguments are consumed here. Each selected specification resolves
 * through workspace discovery to its owner project and project-relative file,
 * and one `nx run <owner>:test --args="<files>"` runs per owner; every other
 * flag is forwarded verbatim to those Nx invocations, so runner flags such as
 * `--skip-nx-cache` reach Nx. A flag that takes a separate value must use the
 * `--flag=value` form, because a bare value would be read as a requirement
 * identity. An unknown identity, an empty selection, or a duplicate identity
 * in the corpus fails before anything runs.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { checkSpecificationBudget } from "./check-spec-budget-lib.js";
import { formatIssue, type CatalogSpecification } from "./specification-catalog-lib.js";
import { discoverSpecifications, readWorkspace } from "./workspace-discovery.js";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");

const rawArguments = process.argv.slice(2);

const requirementIds: string[] = [];
const forwardedArguments: string[] = [];
let selectedClass: string | undefined;
let selectedCharacteristic: string | undefined;

const readSelectionValue = (flag: string, index: number, example: string): string => {
  const value = rawArguments[index];
  if (value === undefined || value.startsWith("-")) {
    console.error(`${flag} requires a value, for example ${flag} ${example}.`);
    process.exit(1);
  }
  return value;
};

for (let index = 0; index < rawArguments.length; index += 1) {
  const argument = rawArguments[index];
  if (argument === undefined) {
    continue;
  }
  if (argument === "--class") {
    index += 1;
    selectedClass = readSelectionValue(argument, index, "quality");
    continue;
  }
  if (argument === "--characteristic") {
    index += 1;
    selectedCharacteristic = readSelectionValue(argument, index, "performance");
    continue;
  }
  if (argument === "--requirement") {
    // Requirement identities follow as positional arguments.
    continue;
  }
  if (argument.startsWith("-")) {
    forwardedArguments.push(argument);
    continue;
  }
  requirementIds.push(argument);
}

const workspace = await readWorkspace();
const discovered = discoverSpecifications(workspace);
const discoveryErrors = discovered.issues.filter((issue) => issue.severity === "error");
if (discoveryErrors.length > 0) {
  for (const issue of discoveryErrors) console.error(formatIssue(issue));
  console.error(
    "Specification discovery failed; selection requires one canonical file per identity.",
  );
  process.exit(1);
}
const corpus = discovered.specifications.map((entry) => entry.specification);

const hasSelection =
  selectedClass !== undefined || selectedCharacteristic !== undefined || requirementIds.length > 0;
let selected: readonly CatalogSpecification[] = corpus;
if (selectedClass !== undefined || selectedCharacteristic !== undefined) {
  selected = corpus.filter(
    (entry) =>
      (selectedClass === undefined || entry.metadata.class === selectedClass) &&
      (selectedCharacteristic === undefined ||
        entry.metadata.characteristic === selectedCharacteristic),
  );
  if (selected.length === 0) {
    const selection = [
      selectedClass !== undefined ? `class "${selectedClass}"` : undefined,
      selectedCharacteristic !== undefined
        ? `characteristic "${selectedCharacteristic}"`
        : undefined,
    ]
      .filter((entry) => entry !== undefined)
      .join(" and ");
    console.error(`No specifications with ${selection} are registered.`);
    process.exit(1);
  }
} else if (requirementIds.length > 0) {
  const byRequirement = new Map(corpus.map((entry) => [entry.metadata.requirement, entry]));
  const chosen: CatalogSpecification[] = [];
  for (const requirementId of requirementIds) {
    const specification = byRequirement.get(requirementId);
    if (specification === undefined) {
      console.error(`Unknown requirement identity: ${requirementId}`);
      console.error("Known identities are listed in specifications/catalog.md.");
      console.error("Pass runner flags that take a value as --flag=value.");
      process.exit(1);
    }
    chosen.push(specification);
  }
  selected = chosen;
}

/** Owner project name → project-relative specification files, in stable order. */
const filesByOwner = new Map<string, string[]>();
for (const specification of selected) {
  const owner = workspace.projects.find((project) => project.name === specification.owner);
  if (owner === undefined) {
    console.error(`Owner project ${specification.owner} is not in the workspace.`);
    process.exit(1);
  }
  const relative =
    owner.root === "" ? specification.source : specification.source.slice(owner.root.length + 1);
  const files = filesByOwner.get(owner.name) ?? [];
  files.push(relative);
  filesByOwner.set(owner.name, files);
}

const commonArguments = [
  ...(forwardedArguments.some((argument) => argument.startsWith("--outputStyle"))
    ? []
    : ["--outputStyle=static"]),
  ...forwardedArguments,
];

const runNx = (nxArguments: readonly string[]): void => {
  const run = spawnSync("pnpm", ["exec", "nx", ...nxArguments], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }
};

const owners = [...filesByOwner.keys()].sort();
if (hasSelection) {
  for (const owner of owners) {
    runNx([
      "run",
      `${owner}:test`,
      `--args=${(filesByOwner.get(owner) ?? []).join(" ")}`,
      ...commonArguments,
    ]);
  }
} else {
  // Every owner runs its specifications in one dependency-aware graph; the
  // filter selects specification files inside each owner's test target.
  runNx([
    "run-many",
    "-t",
    "test",
    "--projects",
    owners.join(","),
    "--args=.spec.ts",
    "--nxBail",
    ...commonArguments,
  ]);
}

// The budget binds the complete fast suite; a selected subset always fits.
if (!hasSelection) {
  const budget = checkSpecificationBudget(repoRoot, owners);
  if (budget.kind === "over-budget") {
    console.error(budget.message);
    process.exit(1);
  }
  console.log(budget.message);
}
