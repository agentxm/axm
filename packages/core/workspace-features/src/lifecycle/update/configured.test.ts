import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import { withDetailedWork } from "@agentxm/workspace-kernel/locations/testing";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";
import { serveBareRepository } from "../../testing/git-repositories.js";
import { writeLocalRulePackage, writeLocalSkillPackage } from "../../testing/local-packages.js";
import { configuredUpdateRequest } from "./test-helpers.js";
import { UpdateExtensions } from "./update-extensions.js";

interface ConfiguredGitEntry {
  readonly type: "skill" | "rule";
  readonly name: string;
  /** The branch the entry is declared at; omitted, the default branch. */
  readonly revision?: string;
}

/**
 * Install each entry from one served repository whose `main` and `other`
 * branches (and tag `v1`) hold the skills `alpha` and `beta` and the rule
 * `gamma`, then prepare a configured update sweep and count the Git checkouts
 * its discovery clones and the remote ref listings it takes. With `apply`, the
 * prepared sweep is then applied, uncounted, and its units are reported.
 */
const sweepGitEntriesCounting = (
  entries: ReadonlyArray<ConfiguredGitEntry>,
  options: { readonly reinstall?: boolean; readonly apply?: boolean } = {},
) => {
  const { workspace, cleanup } = makeInstallWorld();
  return Effect.gen(function* () {
    const source = nodePath.join(workspace.root, "vendor-source");
    fs.mkdirSync(source);
    writeLocalSkillPackage(source, { name: "alpha" });
    writeLocalSkillPackage(source, { name: "beta" });
    writeLocalRulePackage(source, { name: "gamma" });
    const git = (args: ReadonlyArray<string>) =>
      execFileSync(
        "git",
        ["-c", "user.name=AXM Test", "-c", "user.email=test@example.invalid", ...args],
        { cwd: source, stdio: "ignore" },
      );
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "main"]);
    git(["branch", "other"]);
    git(["tag", "v1"]);
    const served = yield* Effect.acquireRelease(
      Effect.promise(() =>
        serveBareRepository({ root: workspace.root, source, name: "extensions" }),
      ),
      (repository) => Effect.sync(repository.stop),
    );
    return yield* workspace.provide(
      Effect.gen(function* () {
        for (const entry of entries) {
          yield* applyInstall(
            installRequest({
              type: entry.type,
              subject: {
                kind: "source",
                source:
                  entry.revision === undefined ? served.url : `${served.url}#${entry.revision}`,
              },
              names: [entry.name],
              all: false,
            }),
          );
        }
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const candidate = yield* UpdateExtensions.prepare(
          configuredUpdateRequest(options.reinstall === true ? { reinstall: true } : {}),
        ).pipe(withDetailedWork(tracer));
        const units =
          options.apply === true && candidate.outcome !== "nothing-configured"
            ? (yield* UpdateExtensions.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              )).resolution.units.map((unit) => ({
                label: unit.label,
                state: unit.state,
                message: unit.message,
              }))
            : [];
        return {
          candidate,
          units,
          checkouts: spans.filter((span) => span.name === "Git.shallowClone").length,
          listings: spans.filter((span) => span.name === "Git.listRemoteRefs").length,
        };
      }),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
};

/** The sweep's outcome and the Git checkouts its discovery cloned. */
const sweepGitEntries = (entries: ReadonlyArray<ConfiguredGitEntry>) =>
  sweepGitEntriesCounting(entries).pipe(
    Effect.map(({ candidate, checkouts }) => ({ outcome: candidate.outcome, checkouts })),
  );

describe("configured update Git checkouts", () => {
  it.effect("checks out one Git URL and revision once for every entry of every kind", () =>
    Effect.gen(function* () {
      const sweep = yield* sweepGitEntries([
        { type: "skill", name: "alpha" },
        { type: "skill", name: "beta" },
        { type: "rule", name: "gamma" },
      ]);
      expect(sweep).toEqual({ outcome: "planned", checkouts: 1 });
    }),
  );

  it.effect("checks out each declared revision of one repository separately", () =>
    Effect.gen(function* () {
      const sweep = yield* sweepGitEntries([
        { type: "skill", name: "alpha", revision: "main" },
        { type: "skill", name: "beta", revision: "other" },
      ]);
      expect(sweep).toEqual({ outcome: "planned", checkouts: 2 });
    }),
  );
});

describe("configured update Git remote ref listings", () => {
  it.effect("lists one Git URL's remote refs once for every entry pinned to a tag", () =>
    Effect.gen(function* () {
      const sweep = yield* sweepGitEntriesCounting(
        [
          { type: "skill", name: "alpha", revision: "v1" },
          { type: "skill", name: "beta", revision: "v1" },
          { type: "rule", name: "gamma", revision: "v1" },
        ],
        { apply: true },
      );
      expect({
        outcome: sweep.candidate.outcome,
        checkouts: sweep.checkouts,
        listings: sweep.listings,
      }).toEqual({ outcome: "planned", checkouts: 0, listings: 1 });
      // Every entry still judged its tag against the shared listing and held.
      expect(sweep.units).toEqual(
        [
          { label: "skills/alpha", name: "alpha" },
          { label: "skills/beta", name: "beta" },
          { label: "rules/gamma", name: "gamma" },
        ].map(({ label, name }) => ({
          label,
          state: "unchanged",
          message: `${name} is pinned to Git tag v1 and is unchanged`,
        })),
      );
    }),
  );

  it.effect("lists once for entries at different branches of one URL", () =>
    Effect.gen(function* () {
      const sweep = yield* sweepGitEntriesCounting([
        { type: "skill", name: "alpha", revision: "main" },
        { type: "skill", name: "beta", revision: "other" },
      ]);
      expect({
        outcome: sweep.candidate.outcome,
        checkouts: sweep.checkouts,
        listings: sweep.listings,
      }).toEqual({ outcome: "planned", checkouts: 2, listings: 1 });
    }),
  );

  it.effect("lists nothing for entries without a selector or when reinstalling", () =>
    Effect.gen(function* () {
      const unpinned = yield* sweepGitEntriesCounting([
        { type: "skill", name: "alpha" },
        { type: "rule", name: "gamma" },
      ]);
      const reinstalled = yield* sweepGitEntriesCounting(
        [
          { type: "skill", name: "alpha", revision: "v1" },
          { type: "rule", name: "gamma", revision: "v1" },
        ],
        { reinstall: true },
      );
      expect({ unpinned: unpinned.listings, reinstalled: reinstalled.listings }).toEqual({
        unpinned: 0,
        reinstalled: 0,
      });
    }),
  );
});
