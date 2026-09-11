/**
 * What the untargeted root update reports about the workspace it sweeps.
 *
 * Every behaviour here is the configured-update feature's — holdback
 * handling across every installable type, prospective Pack compatibility,
 * and how a withheld or exempted release reads. They are bound to the
 * handler because the feature package cannot yet compose a workspace
 * fixture of its own; they belong beside
 * `packages/core/extension-lifecycle/src/update/configured.ts`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";

import { SourceHostProviders, type SourceHostProvidersService } from "@agentxm/extension-sources";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
} from "@agentxm/extension-model/unstable/version-constraints";
import { ReleaseAgePosture, type ReleaseAgePostureValue } from "@agentxm/extension-resolution";
import { CodingAgentRepositoryLive } from "@agentxm/workspace-projection/live";

import {
  AllExtensionManagersLive,
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-support/test-helpers.js";
import { writeKnowledgeExtension, writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import { handleUpdate } from "./handler.js";

describe("root update handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Every Registry lookup selects version 1.0.0 of the requested target. */
  const selectedSourceHostProviders: SourceHostProvidersService = {
    find: () => Effect.die("unused"),
    resolveNamedRegistry: (source, options) => {
      const name = decodeExtensionNameSync(options.name);
      const details = {
        source,
        owner: options.owner,
        name,
        publisherBindingId: "publisher-binding",
        version: decodeVersionSync("1.0.0"),
        integrity: Option.none<string>(),
        packages: [],
      };
      switch (options.type) {
        case "skill":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/skills/${options.name}`,
            ref: {
              type: "skill",
              refType: "registry",
              skill: { name, description: Option.none(), metadata: Option.none() },
              ...details,
            },
          });
        case "mcp-server":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/mcps/${options.name}`,
            ref: { type: "mcp-server", refType: "registry", server: { name }, ...details },
          });
        case "subagent":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/subagents/${options.name}`,
            ref: {
              type: "subagent",
              refType: "registry",
              subagent: { name, description: Option.none() },
              ...details,
            },
          });
        case "rule":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/rules/${options.name}`,
            ref: { type: "rule", refType: "registry", rule: { name }, ...details },
          });
        case "hook":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/hooks/${options.name}`,
            ref: { type: "hook", refType: "registry", hook: { name }, ...details },
          });
        case "knowledge":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/knowledge/${options.name}`,
            ref: { type: "knowledge", refType: "registry", knowledge: { name }, ...details },
          });
        case "pack":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/packs/${options.name}`,
            ref: {
              type: "pack",
              refType: "registry",
              pack: { name, dependencies: {} },
              ...details,
            },
          });
      }
    },
    fetch: () => Effect.die("unused"),
    cloneUrl: () => Option.none(),
    origin: () => "test registry",
  };

  type NamedRegistryOptions = Parameters<SourceHostProvidersService["resolveNamedRegistry"]>[1];

  /** Every Registry lookup withholds a newer release under the age policy. */
  const heldSourceHostProviders = (
    targetOf: (options: NamedRegistryOptions) => string,
    candidateVersion = "1.0.0",
  ): SourceHostProvidersService => ({
    find: () => Effect.die("unused"),
    resolveNamedRegistry: (_source, options) =>
      Effect.succeed({
        kind: "policy_held",
        target: targetOf(options),
        candidate: {
          version: candidateVersion,
          publishedAt: "2026-08-11T12:00:00.000Z",
          eligibleAt: "2026-08-12T12:00:00.000Z",
          minimumReleaseAgeSeconds: 86_400,
        },
      }),
    fetch: () => Effect.die("unused"),
    cloneUrl: () => Option.none(),
    origin: () => "test registry",
  });

  const makeLayers = (opts?: {
    readonly machine?: boolean | undefined;
    readonly sources?: SourceHostProvidersService;
  }) => {
    const ctx = makeWorkspaceHandlerTestContext({
      flags: { nonInteractive: true },
      machine: opts?.machine,
    });
    const coreLayer = Layer.mergeAll(
      ctx.fullLayer,
      CodingAgentRepositoryLive,
      Layer.succeed(SourceHostProviders, opts?.sources ?? selectedSourceHostProviders),
    );
    const fullLayer = Layer.merge(coreLayer, Layer.provide(AllExtensionManagersLive, coreLayer));

    return {
      provide: makeEffectProvide(fullLayer),
      handleUpdate: (
        args: Parameters<typeof handleUpdate>[0],
        releaseAgePosture: ReleaseAgePostureValue = "enforce",
      ) => handleUpdate(args).pipe(Effect.provideService(ReleaseAgePosture, releaseAgePosture)),
      logs: ctx.logs,
      rendererState: ctx.rendererState,
    };
  };

  const rootUpdate = { source: Option.none<string>(), force: false, preview: false };

  it.effect("emits JSON no-op when workspace has no configured extensions to update", () =>
    Effect.gen(function* () {
      const { provide, handleUpdate: update, logs, rendererState } = makeLayers({ machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["claude-code"], owner: "@axm" });

      yield* provide(update(rootUpdate));

      expect(logs.success).toEqual([]);
      const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Update configured extensions",
        message: "No configured extensions.",
      });
      expect(result).toMatchObject({
        planDescription: "Update configured workspace extensions",
      });
    }),
  );

  it.effect("includes configured knowledge bundles in the workspace update plan", () =>
    Effect.gen(function* () {
      const { provide, handleUpdate: update, rendererState } = makeLayers({ machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@axm",
        knowledge: { handbook: "workspace" },
      });
      writeKnowledgeExtension(axmDir, "handbook");

      yield* provide(update(rootUpdate));

      const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Update configured extensions",
        totalSteps: 1,
      });
      expect(planResultUnits(result)).toMatchObject([
        {
          label: "handbook",
          state: "unchanged",
          message: "handbook is workspace-sourced and unchanged",
        },
      ]);
    }),
  );

  it.effect("returns a holdback-only root update as a successful zero-step result", () =>
    Effect.gen(function* () {
      const {
        provide,
        handleUpdate: update,
        rendererState,
      } = makeLayers({
        machine: true,
        sources: heldSourceHostProviders((options) => `${options.owner}/packs/${options.name}`),
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/test-registry" }],
        packs: { fresh: "@acme/packs/fresh" },
      });

      yield* provide(update(rootUpdate));

      const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Update configured extensions",
        totalSteps: 0,
      });
      expect(result).toMatchObject({
        holdbackCount: 1,
        holdbacks: [
          {
            reason: "minimum-release-age",
            target: "@acme/packs/fresh",
            dependencyPath: ["@acme/packs/fresh"],
            candidateVersion: "1.0.0",
            eligibleAt: "2026-08-12T12:00:00.000Z",
          },
        ],
      });
    }),
  );

  it.effect("blocks incompatible prospective Pack updates before building either Pack plan", () =>
    Effect.gen(function* () {
      let fetches = 0;
      const {
        provide,
        handleUpdate: update,
        rendererState,
      } = makeLayers({
        machine: true,
        sources: {
          ...selectedSourceHostProviders,
          // A pack plan can only be built by materializing its package; a
          // fetch here is proof that planning ran past the compatibility gate.
          fetch: () =>
            Effect.suspend(() => {
              fetches += 1;
              return Effect.die("unused");
            }),
          resolveNamedRegistry: (source, options) =>
            selectedSourceHostProviders.resolveNamedRegistry(source, options).pipe(
              Effect.map((resolution) => {
                if (resolution.kind !== "selected" || resolution.ref.type !== "pack") {
                  return resolution;
                }
                const range = decodeVersionRangeSync(
                  resolution.ref.name === "one" ? "^1.0.0" : "^2.0.0",
                );
                return {
                  ...resolution,
                  ref: {
                    ...resolution.ref,
                    pack: {
                      ...resolution.ref.pack,
                      dependencies: { "@acme/skills/review": range },
                    },
                  },
                };
              }),
            ),
        },
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/test-registry" }],
        packs: { one: "@acme/packs/one", two: "@acme/packs/two" },
      });
      const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
      const lockBefore = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8");

      yield* provide(update(rootUpdate, "ignore"));

      expect(fetches).toBe(0);
      expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
      expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).toBe(lockBefore);
      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          outcome: "blocked",
          mode: "apply",
          blocking: {
            class: "precondition-unmet",
            phase: "planning",
            detail: expect.stringMatching(
              /skill review: incompatible constraints .*@acme\/packs\/one range=\^1\.0\.0.*@acme\/packs\/two range=\^2\.0\.0/u,
            ),
          },
          counts: { committed: 0, failed: 0 },
        },
      });
    }),
  );

  it.effect("renders an actionable minimum-release-age section for people", () =>
    Effect.gen(function* () {
      const {
        provide,
        handleUpdate: update,
        logs,
      } = makeLayers({
        sources: heldSourceHostProviders(
          (options) => `${options.owner}/skills/${options.name}`,
          "2.0.0",
        ),
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer" },
      });

      yield* provide(update(rootUpdate));

      expect(logs.warn).toContain("1 newer release held by the 24h minimum release age");
      expect(logs.info).toContain(
        "@acme/skills/reviewer 2.0.0 published 2026-08-11T12:00:00.000Z, eligible 2026-08-12T12:00:00.000Z",
      );
      expect(logs.info.some((message) => message.includes("--ignore-release-age"))).toBe(true);
    }),
  );

  it.effect("names the exemption and both timestamps when a release skips the age gate", () =>
    Effect.gen(function* () {
      const {
        provide,
        handleUpdate: update,
        logs,
      } = makeLayers({
        sources: {
          ...selectedSourceHostProviders,
          resolveNamedRegistry: (source, options) =>
            selectedSourceHostProviders.resolveNamedRegistry(source, options).pipe(
              Effect.map((resolution) =>
                resolution.kind === "selected"
                  ? {
                      ...resolution,
                      kind: "exempted" as const,
                      exemption: {
                        bypassCause: "exclude" as const,
                        exemptionScope: "project" as const,
                      },
                      bypassed: {
                        version: "1.0.0",
                        publishedAt: "2026-08-11T12:00:00.000Z",
                        eligibleAt: "2026-08-12T12:00:00.000Z",
                        minimumReleaseAgeSeconds: 86_400,
                      },
                    }
                  : resolution,
              ),
            ),
        },
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer" },
      });

      yield* provide(update(rootUpdate));

      expect(logs.warn).toContain("1 release skipped the 24h minimum release age");
      expect(logs.info).toContain(
        "Selected @acme/skills/reviewer 1.0.0 ahead of its eligibility at 2026-08-12T12:00:00.000Z (published 2026-08-11T12:00:00.000Z) — exempt via minimumReleaseAgeExclude in project settings",
      );
    }),
  );

  it.effect("applies configured holdback handling to every installable extension type", () =>
    Effect.gen(function* () {
      const plural: Record<NamedRegistryOptions["type"], string> = {
        skill: "skills",
        "mcp-server": "mcps",
        subagent: "subagents",
        rule: "rules",
        hook: "hooks",
        knowledge: "knowledge",
        pack: "packs",
      };
      const {
        provide,
        handleUpdate: update,
        rendererState,
      } = makeLayers({
        machine: true,
        sources: heldSourceHostProviders(
          (options) => `${options.owner}/${plural[options.type]}/${options.name}`,
        ),
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "agentxm", location: "file:///tmp/test-registry" }],
        skills: { skill: "@acme/skills/skill" },
        mcps: { server: "@acme/mcps/server" },
        subagents: { subagent: "@acme/subagents/subagent" },
        rules: { rule: "@acme/rules/rule" },
        hooks: { hook: "@acme/hooks/hook" },
        knowledge: { knowledge: "@acme/knowledge/knowledge" },
        packs: { pack: "@acme/packs/pack" },
      });

      yield* provide(update(rootUpdate));

      const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Update configured extensions",
        totalSteps: 0,
      });
      expect(result).toMatchObject({
        holdbackCount: 7,
        holdbacks: [
          { target: "@acme/hooks/hook" },
          { target: "@acme/knowledge/knowledge" },
          { target: "@acme/mcps/server" },
          { target: "@acme/packs/pack" },
          { target: "@acme/rules/rule" },
          { target: "@acme/skills/skill" },
          { target: "@acme/subagents/subagent" },
        ],
      });
    }),
  );
});
