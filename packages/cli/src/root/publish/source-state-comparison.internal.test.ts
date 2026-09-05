/**
 * Internal verification of when the publish command consults the Git
 * directory comparison: never for an existing version verified as an exact
 * archive match, and once more immediately before upload so an apply whose
 * source evidence moved after planning is refused. Counting comparison
 * invocations is an implementation observation, so it lives beside the
 * command rather than in the accepted specification it supports
 * (`cli/publish/requires-explicit-acceptance-for-non-head-source`).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/registry-auth/testing";
import {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
  type GitDirectoryDifference,
} from "@agentxm/extension-sources";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  at,
  expectPublishResult,
  expectRecord,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { handleRootPublish, type RootPublishHandlerArgs } from "./command.js";

const args = (
  registryUrl: string,
  overrides?: Partial<RootPublishHandlerArgs>,
): RootPublishHandlerArgs => ({
  selectors: ["@acme/skills/review"],
  owners: [],
  types: [],
  excludes: [],
  registry: Option.none(),
  registryUrl: Option.some(registryUrl),
  onExisting: Option.none(),
  backfill: false,
  acceptWarnings: false,
  preview: true,
  scope: "project",
  visibility: Option.none(),
  includeDependencies: false,
  ...overrides,
});

const revision = "0123456789abcdef0123456789abcdef01234567";

const comparisonOutcome =
  (differences: ReadonlyArray<GitDirectoryDifference>): GitDirectoryComparisonService["compare"] =>
  ({ directory }) =>
    Effect.succeed(
      Option.some({
        repositoryRoot: path.dirname(path.dirname(directory)),
        repositoryDirectory: `skills/${path.basename(directory)}`,
        headRevision: revision,
        differences,
      }),
    );

/** The first outcome of a publish result normalized by `expectPublishResult`. */
const firstOutcome = (
  result: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const outcomes = property(result, "results");
  if (!Array.isArray(outcomes)) throw new Error("Expected publish outcomes");
  return expectRecord(at(outcomes, 0));
};

describe("publish source-state comparison scheduling", () => {
  let tempDir: string;
  let registryUrl: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-publish-source-state-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    const registryRoot = path.join(tempDir, "registry");
    fs.mkdirSync(registryRoot, { recursive: true });
    registryUrl = pathToFileURL(registryRoot).href;
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ owner: "@acme", agents: [], skills: { review: "workspace" } }),
    );
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
    const skillDir = path.join(tempDir, "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeContext = (compare: GitDirectoryComparisonService["compare"]) => {
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
      wsOptions: { projectRoot: tempDir },
    });
    return {
      ...context,
      provide: makeEffectProvide(
        Layer.mergeAll(
          context.fullLayer,
          AuthClientTest(),
          DeviceLoginInteractionTest().layer,
          Layer.succeed(GitDirectoryComparison, { compare }),
        ),
      ),
    };
  };

  it.effect("does not compare an existing version verified as an exact archive match", () => {
    const published = makeContext(() => Effect.succeed(Option.none()));
    let comparisonCount = 0;
    const verifying = makeContext(() =>
      Effect.sync(() => {
        comparisonCount += 1;
        return Option.none();
      }),
    );

    return Effect.gen(function* () {
      yield* published.provide(handleRootPublish(args(registryUrl, { preview: false })));

      yield* verifying.provide(
        handleRootPublish(args(registryUrl, { onExisting: Option.some("verify") })),
      );

      expect(comparisonCount).toBe(0);
      const result = expectPublishResult(at(verifying.rendererState.results, 0).data, {
        mode: "preview",
        count: 1,
      });
      expect(firstOutcome(result)).toMatchObject({
        action: "skip",
        reason: "version_already_published",
        status: "success",
      });
    });
  });

  it.effect(
    "re-assesses source state before upload and refuses an apply whose evidence moved",
    () => {
      let comparisonCount = 0;
      const context = makeContext((input) => {
        comparisonCount += 1;
        return comparisonOutcome(
          comparisonCount === 1
            ? [{ path: "src/SKILL.md", change: "modified" }]
            : [
                { path: "notes.md", change: "added" },
                { path: "src/SKILL.md", change: "modified" },
              ],
        )(input);
      });

      return Effect.gen(function* () {
        const exit = yield* context
          .provide(handleRootPublish(args(registryUrl, { preview: false, acceptWarnings: true })))
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        expect(comparisonCount).toBe(2);
        expect(fs.readdirSync(path.join(tempDir, "registry"))).toEqual([]);
        const result = expectPublishResult(at(context.rendererState.results, 0).data, {
          mode: "apply",
          count: 1,
        });
        const execution = expectRecord(property(result, "execution"));
        expect(expectRecord(property(execution, "failure"))).toMatchObject({
          code: "conflict",
          message: expect.stringContaining("changed after planning"),
        });
        expect(firstOutcome(result)).toMatchObject({ status: "blocked", reason: "stale_material" });
      });
    },
  );
});
