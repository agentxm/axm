import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-isolates-candidate-state",
  title: "Release preparation isolates candidate state until delivery",
  statement:
    "Release preparation shall generate candidate state in a disposable detached worktree with a frozen lockfile, deliver it only in a real run after confirming the invoking checkout is unchanged, and clean up every allocated candidate even when a step fails.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "safe-repetition"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed task interface and the contributor-facing release guide show what the release-preparation entry point promises about candidate isolation, delivery, and cleanup; the orchestration itself is driven against a fake host by the bound tooling gate.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The tooling test gate declared as bound evidence runs on every change through the required aggregate check.",
  ],
  openQuestions: [],
});

/**
 * The release-preparation orchestration accepts an injected host, and the
 * repository tooling tests drive it against a fake one, asserting the
 * observable sequence of effects. Their results are evidence bound to this
 * identity; the specification remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-prepare.tooling.test.ts)",
    verifies:
      "Drives release preparation against a fake host and checks that candidate state is allocated and initialized from the preflighted source commit, that a dry run prepares the candidate and never commits, pushes, or opens a pull request, that a real run commits and confirms the invoking checkout is unchanged before pushing, that every allocated candidate is cleaned up when any later step fails, that a cleanup failure never hides the primary failure, and that the entry point allocates a temporary detached worktree installed with a frozen lockfile.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const readJsonRecord = (relativePath: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${relativePath} must contain a JSON object`);
  }
  return { ...parsed };
};

const child = (parent: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = parent[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected an object at ${key}`);
  }
  return { ...value };
};

describe("Isolated release candidate state", () => {
  it.effect(
    "candidate generation is reachable only through the release-preparation entry point",
    () =>
      Effect.sync(() => {
        const scripts = child(readJsonRecord("package.json"), "scripts");
        const targets = child(readJsonRecord("project.json"), "targets");
        // The published entry point routes to the root release-preparation
        // target; candidate generation is an internal target that runs only
        // inside the disposable checkout and is not published as a script.
        expect(scripts["release:prepare"]).toBe("pnpm exec nx run axm:release-prepare");
        expect(Object.keys(targets)).toContain("release-prepare");
        expect(Object.keys(targets)).toContain("release-prepare-candidate");
        const candidateInvocations = Object.values(scripts).filter(
          (command) => typeof command === "string" && command.includes("release-prepare-candidate"),
        );
        expect(candidateInvocations).toEqual([]);
      }),
  );

  it.effect(
    "the release guide promises a disposable detached worktree, delivery only in a real run, and cleanup on failure",
    () =>
      Effect.sync(() => {
        const guide = fs
          .readFileSync(path.join(repoRoot, "contributing", "guides", "releasing.md"), "utf8")
          .replace(/\s+/g, " ")
          .toLowerCase();
        expect(guide).toContain("disposable detached git worktree");
        expect(guide).toContain("installs the locked workspace dependencies");
        expect(guide).toContain(
          "removes it without committing, pushing, opening a pull request, or publishing",
        );
        expect(guide).toContain("the invoking checkout stays clean");
        expect(guide).toContain("remove the owned disposable worktree");
      }),
  );
});
