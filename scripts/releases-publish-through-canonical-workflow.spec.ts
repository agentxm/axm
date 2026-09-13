import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { readReleaseWorkflow, readReleaseWorkflowTriggers } from "./release-workflow-graph.js";

export const specification = defineSpecification({
  requirement: "system/process/releases-publish-through-canonical-workflow",
  title: "One automated workflow publishes releases",
  statement:
    "Release artifacts shall be published only by the canonical publish.yml workflow, automatically after successful exact merged-revision CI or through its explicit recovery and bootstrap-prerelease modes, and no other workflow shall publish release artifacts.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed workflow files show which workflow publishes releases, what triggers it, and that no other workflow does.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Publishing credentials are available only to the canonical workflow, so no manual or external path can publish release artifacts.",
  ],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const workflowsDirectory = path.join(repoRoot, ".github", "workflows");

/** Exercise the committed selection script without publishing or reaching a remote provider. */
const withPublicationSource = (
  use: (fixture: {
    readonly commit: (subject: string, version?: string) => string;
    readonly checkout: (sha: string) => void;
    readonly select: (input: Readonly<Record<string, string>>) => {
      readonly status: number | null;
      readonly output: string;
      readonly selected: Readonly<Record<string, string>>;
    };
  }) => void,
) => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "axm-publication-source-"));
  const remote = path.join(directory, "origin.git");
  const checkout = path.join(directory, "checkout");
  const outputPath = path.join(directory, "selected");
  const environment = {
    PATH: process.env["PATH"],
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  const git = (...args: ReadonlyArray<string>) =>
    execFileSync("git", args, { cwd: checkout, env: environment, encoding: "utf8" }).trim();
  try {
    fs.mkdirSync(checkout);
    git("init", "--quiet", "--bare", "--initial-branch=main", remote);
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.email", "publication-source@example.invalid");
    git("config", "user.name", "Publication source fixture");
    git("remote", "add", "origin", remote);
    fs.mkdirSync(path.join(checkout, "apps", "cli"), { recursive: true });
    const source = readReleaseWorkflow().jobs["source"];
    const script = source?.steps.find(
      (step) => step.name === "Resolve exact publication source",
    )?.run;
    if (script === undefined) throw new Error("The publication source guard must be executable.");
    use({
      commit: (subject, version = "1.2.3") => {
        fs.writeFileSync(
          path.join(checkout, "apps", "cli", "package.json"),
          JSON.stringify({ version }),
        );
        git("add", ".");
        git("commit", "--quiet", "--allow-empty", "-m", subject);
        git("push", "--quiet", "origin", "main");
        return git("rev-parse", "HEAD");
      },
      checkout: (sha) => {
        git("checkout", "--quiet", "--detach", sha);
      },
      select: (input) => {
        fs.writeFileSync(outputPath, "");
        const result = spawnSync("bash", ["--noprofile", "--norc", "-c", script], {
          cwd: checkout,
          env: {
            ...environment,
            GITHUB_OUTPUT: outputPath,
            EVENT_NAME: "workflow_run",
            CI_CONCLUSION: "success",
            CI_EVENT: "push",
            CI_HEAD_BRANCH: "main",
            CI_HEAD_SHA: git("rev-parse", "HEAD"),
            CI_RUN_ID: "42",
            ...input,
          },
          encoding: "utf8",
          timeout: 10_000,
        });
        if (result.error !== undefined) throw result.error;
        const selected = Object.fromEntries(
          fs
            .readFileSync(outputPath, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const separator = line.indexOf("=");
              if (separator <= 0) throw new Error(`Invalid publication output: ${line}`);
              return [line.slice(0, separator), line.slice(separator + 1)];
            }),
        );
        return { status: result.status, output: result.stdout + result.stderr, selected };
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

/**
 * What publishing a release artifact actually looks like in a workflow: the
 * distribution and promotion entry points, the credentials only the canonical
 * workflow may hold, and the tap token that writes the public formula. A
 * second workflow that published releases would have to carry at least one of
 * these, whatever it called its own job.
 */
const PUBLICATION_SIGNALS = [
  "axm:distribute-release",
  "axm:publish-bootstrap-prerelease",
  "axm:reconcile-github-release",
  "axm:promote-release-channel",
  "axm:update-homebrew-formula",
  "HOMEBREW_TAP_TOKEN",
  "AXM_RELEASE_CONTROL_TOKEN",
] as const;

describe("Canonical release workflow", () => {
  it.effect("continues merged release CI and exposes only bounded manual modes", () =>
    Effect.sync(() => {
      const triggers = readReleaseWorkflowTriggers();
      expect(triggers.workflow_run).toEqual({ workflows: ["CI"], types: ["completed"] });
      expect(Object.keys(triggers.workflow_dispatch.inputs)).toEqual([
        "mode",
        "release_tag",
        "source_sha",
      ]);
      expect(triggers.workflow_dispatch.inputs["mode"]).toMatchObject({
        required: true,
        options: ["stable-recovery", "bootstrap-prerelease"],
      });
      expect(Object.keys(triggers)).toEqual(["workflow_run", "workflow_dispatch"]);
    }),
  );

  it.effect("validates the release asset set before it distributes anything", () =>
    Effect.sync(() => {
      const release = readReleaseWorkflow().jobs["release"];
      if (release === undefined) throw new Error("publish.yml must declare the `release` job");
      const steps = release.steps.map((step) => step.run ?? "");
      const validated = steps.findIndex((run) => run.includes("axm:validate-release-assets"));
      const npmValidated = steps.findIndex((run) => run.includes("axm:validate-release-cohort"));
      const prepared = steps.findIndex(
        (run) => run.includes("axm:reconcile-github-release") && run.includes("prepare"),
      );
      const distributed = steps.findIndex(
        (run, index) => index > prepared && run.includes("axm:distribute-release"),
      );
      expect(validated).toBeGreaterThan(-1);
      expect(npmValidated).toBeGreaterThan(validated);
      expect(prepared).toBeGreaterThan(npmValidated);
      expect(distributed).toBeGreaterThan(prepared);
    }),
  );

  it.effect("accepts automation authority only from successful main push CI", () =>
    Effect.sync(() => {
      const workflow = readReleaseWorkflow();
      const source = workflow.jobs["source"];
      if (source === undefined) throw new Error("publish.yml must declare the `source` job");
      expect(source.if).toContain("workflow_run.conclusion == 'success'");
      expect(source.if).toContain("workflow_run.event == 'push'");
      expect(source.if).toContain("workflow_run.head_branch == 'main'");
      expect(
        source.steps.some(
          (step) =>
            step.run?.includes("git log origin/main") === true &&
            step.run.includes("Expected exactly one canonical release commit"),
        ),
      ).toBe(true);
      expect(workflow.jobs["release"]?.needs).toBe("source");
      expect(workflow.jobs["release"]?.steps[0]?.with?.["ref"]).toBe(
        "${{ needs.source.outputs.tooling_sha }}",
      );
      expect(
        workflow.jobs["release"]?.steps.some(
          (step) =>
            step.run?.includes("axm:resolve-release-meta") === true &&
            step.run.includes("needs.source.outputs.sha"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("owns the bootstrap prerelease and exact installation check", () =>
    Effect.sync(() => {
      const workflow = readReleaseWorkflow();
      const bootstrap = workflow.jobs["bootstrap-prerelease"];
      const verification = workflow.jobs["bootstrap-prerelease-verify"];
      expect(
        bootstrap?.steps.some((step) => step.run?.includes("publish-bootstrap-prerelease")),
      ).toBe(true);
      expect(
        verification?.steps.some(
          (step) =>
            step.run?.includes("npm install --global") && step.run.includes("axm --version"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("selects only the exact successful merged release revision for automation", () =>
    Effect.sync(() =>
      withPublicationSource(({ commit, select }) => {
        const sha = commit("release: cli-v1.2.3 (#17)");
        const result = select({});
        expect(result.status, result.output).toBe(0);
        expect(result.selected).toEqual({
          eligible: "true",
          mode: "stable-auto",
          tag: "cli-v1.2.3",
          sha,
          tooling_sha: sha,
          ci_run_id: "42",
        });
        for (const input of [
          { CI_EVENT: "pull_request" },
          { CI_CONCLUSION: "failure" },
          { CI_HEAD_BRANCH: "contributor-branch" },
        ]) {
          const rejected = select(input);
          expect(rejected.status, rejected.output).toBe(0);
          expect(rejected.selected["eligible"]).toBe("false");
        }
        const mismatch = select({ CI_HEAD_SHA: "0".repeat(40) });
        expect(mismatch.status, mismatch.output).not.toBe(0);
        expect(mismatch.selected["eligible"]).not.toBe("true");
      }),
    ),
  );

  it.effect("does not publish ordinary commits or inconsistent release declarations", () =>
    Effect.sync(() =>
      withPublicationSource(({ commit, select }) => {
        commit("Improve workspace inspection");
        const ordinary = select({});
        expect(ordinary.status, ordinary.output).toBe(0);
        expect(ordinary.selected["eligible"]).toBe("false");
        commit("release: cli-v1.2.4", "1.2.3");
        const mismatch = select({});
        expect(mismatch.status, mismatch.output).not.toBe(0);
        expect(mismatch.selected["eligible"]).not.toBe("true");
        commit("release: cli-v1.2.3 unreviewed suffix");
        const malformed = select({});
        expect(malformed.status, malformed.output).not.toBe(0);
        expect(malformed.selected["eligible"]).not.toBe("true");
      }),
    ),
  );

  it.effect("recovers a unique merged release using current main's tooling", () =>
    Effect.sync(() =>
      withPublicationSource(({ commit, select }) => {
        const released = commit("release: cli-v1.2.3");
        const current = commit("Improve release recovery", "1.2.4");
        const result = select({
          EVENT_NAME: "workflow_dispatch",
          REQUESTED_MODE: "stable-recovery",
          RELEASE_TAG: "cli-v1.2.3",
        });
        expect(result.status, result.output).toBe(0);
        expect(result.selected).toEqual({
          eligible: "true",
          mode: "stable-recovery",
          tag: "cli-v1.2.3",
          sha: released,
          tooling_sha: current,
          ci_run_id: "",
        });
      }),
    ),
  );

  it.effect("refuses missing and ambiguous recovery authorities", () =>
    Effect.sync(() =>
      withPublicationSource(({ commit, select }) => {
        commit("release: cli-v1.2.3");
        commit("release: cli-v1.2.3 (#18)");
        for (const tag of ["", "cli-v9.9.9", "cli-v1.2.3"]) {
          const result = select({
            EVENT_NAME: "workflow_dispatch",
            REQUESTED_MODE: "stable-recovery",
            RELEASE_TAG: tag,
          });
          expect(result.status, result.output).not.toBe(0);
          expect(result.selected["eligible"]).not.toBe("true");
        }
      }),
    ),
  );

  it.effect("requires an exact current-main source for bootstrap publication", () =>
    Effect.sync(() =>
      withPublicationSource(({ commit, checkout, select }) => {
        const previous = commit("Previous source");
        const current = commit("Current source");
        const input = { EVENT_NAME: "workflow_dispatch", REQUESTED_MODE: "bootstrap-prerelease" };
        const accepted = select({ ...input, SOURCE_SHA: current });
        expect(accepted.status, accepted.output).toBe(0);
        expect(accepted.selected).toEqual({
          eligible: "true",
          mode: "bootstrap-prerelease",
          tag: "",
          sha: current,
          tooling_sha: current,
          ci_run_id: "",
        });
        for (const sha of ["main", current.slice(0, 12), previous]) {
          const rejected = select({ ...input, SOURCE_SHA: sha });
          expect(rejected.status, rejected.output).not.toBe(0);
          expect(rejected.selected["eligible"]).not.toBe("true");
        }
        checkout(previous);
        const superseded = select({ ...input, SOURCE_SHA: previous });
        expect(superseded.status, superseded.output).not.toBe(0);
        expect(superseded.selected["eligible"]).not.toBe("true");
      }),
    ),
  );

  it.effect("no other workflow carries a release-publication signal", () =>
    Effect.sync(() => {
      const others = fs
        .readdirSync(workflowsDirectory)
        .filter((file) => file !== "publish.yml" && /\.ya?ml$/u.test(file))
        .sort();
      expect(others.length).toBeGreaterThan(0);
      const carried = others.flatMap((file) => {
        const text = fs.readFileSync(path.join(workflowsDirectory, file), "utf8");
        return PUBLICATION_SIGNALS.filter((signal) => text.includes(signal)).map(
          (signal) => `${file}: ${signal}`,
        );
      });
      expect(carried).toEqual([]);
    }),
  );
});
