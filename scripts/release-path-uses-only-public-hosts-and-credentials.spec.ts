import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { describe, expect, it } from "@effect/vitest";
import { defineBoundEvidence, defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "system/process/release-path-uses-only-public-hosts-and-credentials",
  title: "Release automation uses only public distribution boundaries",
  statement:
    "AXM release preparation, production and publication shall distribute only through the declared public GitHub, npm and Homebrew hosts with their publication credentials. Optional independently configured task caches may supply deterministic prerequisites using read-only credentials confined to cache setup; disabling remote caching shall preserve the release task graph.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The release workflows, their root task definitions and the transitively imported release scripts expose every committed host and repository-secret reference used by release automation.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Provider-owned action implementations and package-manager behavior remain outside the repository source boundary.",
  ],
  openQuestions: [],
});

export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-path-uses-only-public-hosts-and-credentials.spec.ts)",
    verifies:
      "Discovers the committed release workflows and their transitive root-script graph, rejects host and repository-secret references outside explicit allowlists, and proves both rejection paths with a fixture workflow.",
  },
]);

interface ReleaseSource {
  readonly path: string;
  readonly text: string;
}

const repositoryRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/prepare-release.yml",
  ".github/workflows/publish.yml",
] as const;
const allowedHosts = new Set(["api.github.com", "github.com", "registry.npmjs.org"]);
const allowedSecrets = new Set(["HOMEBREW_TAP_TOKEN", "NPM_INITIAL_PUBLISH_TOKEN"]);
const scriptReference = /\b(scripts\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]s|sh))\b/gu;
const targetReference = /\baxm:([a-z0-9:-]+)\b/gu;
const relativeImport = /\b(?:from\s+|import\s*)["'](\.[^"']+)["']/gu;
const hostReference = /\bhttps?:\/\/([A-Za-z0-9.-]+)/gu;
const secretReference = /\bsecrets\.([A-Z][A-Z0-9_]*)\b/gu;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSource = (relativePath: string): ReleaseSource => ({
  path: relativePath,
  text: fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
});

const collectMatches = (text: string, pattern: RegExp): ReadonlyArray<string> =>
  [...text.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));

const targetScripts = (
  project: Readonly<Record<string, unknown>>,
  targetNames: ReadonlySet<string>,
): ReadonlyArray<string> => {
  const targets = project["targets"];
  if (!isRecord(targets)) throw new Error("project.json must declare root targets.");
  return [...targetNames].flatMap((targetName) => {
    const target = targets[targetName];
    if (!isRecord(target)) throw new Error(`Missing release target axm:${targetName}.`);
    return collectMatches(JSON.stringify(target), scriptReference);
  });
};

const resolveLocalImport = (sourcePath: string, specifier: string): string | undefined => {
  const unresolved = path.normalize(path.join(path.dirname(sourcePath), specifier));
  const candidates = [
    unresolved,
    unresolved.replace(/\.js$/u, ".ts"),
    `${unresolved}.ts`,
    path.join(unresolved, "index.ts"),
  ];
  return candidates.find(
    (candidate) =>
      candidate.startsWith("scripts/") && fs.existsSync(path.join(repositoryRoot, candidate)),
  );
};

const releaseSources = (): ReadonlyArray<ReleaseSource> => {
  const workflows = workflowPaths.map(readSource);
  const targetNames = new Set(
    workflows.flatMap((workflow) => collectMatches(workflow.text, targetReference)),
  );
  const project: unknown = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "project.json"), "utf8"),
  );
  if (!isRecord(project)) throw new Error("project.json must contain an object.");
  const pending = [
    ...new Set([
      ...workflows.flatMap((workflow) => collectMatches(workflow.text, scriptReference)),
      ...targetScripts(project, targetNames),
    ]),
  ];
  const scripts = new Map<string, ReleaseSource>();
  while (pending.length > 0) {
    const sourcePath = pending.shift();
    if (sourcePath === undefined || scripts.has(sourcePath)) continue;
    const source = readSource(sourcePath);
    scripts.set(sourcePath, source);
    for (const specifier of collectMatches(source.text, relativeImport)) {
      const dependency = resolveLocalImport(sourcePath, specifier);
      if (dependency !== undefined && !scripts.has(dependency)) pending.push(dependency);
    }
    for (const targetScript of targetScripts(
      project,
      new Set(collectMatches(source.text, targetReference)),
    )) {
      if (!scripts.has(targetScript)) pending.push(targetScript);
    }
  }
  return [
    ...workflows,
    ...[...scripts.values()].sort((left, right) => left.path.localeCompare(right.path)),
  ];
};

const releaseBoundaryText = (source: ReleaseSource): string => {
  if (!source.path.endsWith(".yml")) return source.text;
  const workflow: unknown = YAML.parse(source.text);
  if (!isRecord(workflow) || !isRecord(workflow["jobs"])) return source.text;
  for (const job of Object.values(workflow["jobs"])) {
    if (!isRecord(job) || !Array.isArray(job["steps"])) continue;
    for (const candidate of job["steps"]) {
      const step: unknown = candidate;
      if (!isRecord(step) || step["uses"] !== "./.github/actions/setup-workspace") continue;
      const inputs = step["with"];
      if (
        !isRecord(inputs) ||
        inputs["remote-cache-url"] !== "${{ vars.NX_REMOTE_CACHE_URL }}" ||
        inputs["remote-cache-token"] !== "${{ secrets.NX_REMOTE_CACHE_READ_TOKEN }}"
      )
        continue;
      // Exempt only this optional, read-only setup input. Any other use of the
      // reader or any writer reference still violates the publication boundary.
      Reflect.set(step, "with", {
        ...inputs,
        "remote-cache-token": "optional read-only task cache",
      });
    }
  }
  return JSON.stringify(workflow);
};

const boundaryViolations = (sources: ReadonlyArray<ReleaseSource>): ReadonlyArray<string> =>
  sources
    .flatMap((source) => [
      ...collectMatches(releaseBoundaryText(source), hostReference)
        .filter((host) => !allowedHosts.has(host))
        .map((host) => `${source.path}: unlisted release host ${host}`),
      ...collectMatches(releaseBoundaryText(source), secretReference)
        .filter((secret) => !allowedSecrets.has(secret))
        .map((secret) => `${source.path}: unlisted release secret ${secret}`),
    ])
    .sort();

describe("Release automation uses only public distribution boundaries", () => {
  it("keeps the committed release graph inside the host and credential allowlists", () => {
    const sources = releaseSources();
    expect(sources.map((source) => source.path)).toEqual(
      expect.arrayContaining([
        ".github/workflows/ci.yml",
        ".github/workflows/prepare-release.yml",
        ".github/workflows/publish.yml",
        "scripts/distribute-release.ts",
        "scripts/reconcile-github-release.ts",
        "scripts/release-publication.ts",
        "scripts/update-homebrew-formula.ts",
      ]),
    );
    expect(boundaryViolations(sources)).toEqual([]);
  });

  it("rejects readers outside cache setup and every writer reference", () => {
    for (const secret of ["NX_REMOTE_CACHE_READ_TOKEN", "NX_REMOTE_CACHE_WRITE_TOKEN"]) {
      const fixture = {
        path: "fixture.yml",
        text: `jobs:\n  publish:\n    steps:\n      - run: publish\n        env:\n          TOKEN: \${{ secrets.${secret} }}\n`,
      };
      expect(boundaryViolations([fixture])).toEqual([
        `fixture.yml: unlisted release secret ${secret}`,
      ]);
    }
  });

  it("rejects an unlisted host and repository secret in a fixture workflow", () => {
    const fixture = {
      path: ".github/workflows/release-boundary-fixture.yml",
      text: `jobs:
  publish:
    steps:
      - run: curl https://release-boundary.invalid/candidate
        env:
          PUBLISH_TOKEN: \${{ secrets.UNLISTED_RELEASE_TOKEN }}
`,
    };
    expect(boundaryViolations([fixture])).toEqual([
      ".github/workflows/release-boundary-fixture.yml: unlisted release host release-boundary.invalid",
      ".github/workflows/release-boundary-fixture.yml: unlisted release secret UNLISTED_RELEASE_TOKEN",
    ]);
  });
});
