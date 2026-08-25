import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "../hooks/install/command-actions.js";
import {
  InstallKnowledgeCommandWorkflowActions,
  type InstallKnowledgeHandlerArgs,
} from "../knowledge/install/command-actions.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcps/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import {
  InstallRuleCommandWorkflowActions,
  type InstallRuleHandlerArgs,
} from "../rules/install/command-actions.js";
import {
  InstallSkillCommandWorkflowActions,
  type InstallSkillSourceHandlerArgs,
} from "../skills/install/command-actions.js";
import {
  InstallSubagentCommandWorkflowActions,
  type InstallSubagentSourceHandlerArgs,
} from "../subagents/install/command-actions.js";
import {
  expectNoOpPlanResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-helpers.js";
import {
  computePackageContentHashSync,
  writeKnowledgeExtension,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "@agentxm/client-core/unstable/source-resolution";
import { decodeVersionSync } from "@agentxm/client-core/unstable/version-constraints";
import { decodeExtensionNameSync } from "@agentxm/client-core/unstable/extensions";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";

import { handleUpdate, type RootUpdateFlags } from "./handler.js";

interface UpdateCall extends RootUpdateFlags {
  readonly source: string;
  readonly type: string;
}

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

  const makePlan = (label: string) => ({
    _tag: "Plan" as const,
    name: `Update ${label}`,
    description: Option.none<string>(),
    jobs: [
      {
        concurrency: 1 as const,
        steps: [
          {
            readiness: "ready" as const,
            label,
            run: Effect.succeed({
              result: "success" as const,
              message: `Updated ${label}`,
            }),
          },
        ],
      },
    ],
  });

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
            ref: {
              type: "mcp-server",
              refType: "registry",
              server: { name },
              ...details,
            },
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
            ref: {
              type: "rule",
              refType: "registry",
              rule: { name },
              ...details,
            },
          });
        case "hook":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/hooks/${options.name}`,
            ref: {
              type: "hook",
              refType: "registry",
              hook: { name },
              ...details,
            },
          });
        case "knowledge":
          return Effect.succeed({
            kind: "selected",
            target: `${options.owner}/knowledge/${options.name}`,
            ref: {
              type: "knowledge",
              refType: "registry",
              knowledge: { name },
              ...details,
            },
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

  const makeLayers = (
    calls: Array<UpdateCall>,
    opts?: {
      readonly machine?: boolean | undefined;
      readonly sources?: SourceHostProvidersService;
    },
  ) => {
    const ctx = makeWorkspaceHandlerTestContext({
      flags: { nonInteractive: true },
      machine: opts?.machine,
    });

    const skillActions = {
      parseArgs: (args: InstallSkillSourceHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "skill",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ skillsToInstall: [] }),
      buildPlan: () => Effect.succeed(makePlan("skill")),
    };

    const mcpServerActions = {
      parseArgs: (args: InstallMcpServerHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "mcp-server",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("mcp-server")),
    };

    const subagentActions = {
      parseArgs: (args: InstallSubagentSourceHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "subagent",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ subagentsToInstall: [] }),
      buildPlan: () => Effect.succeed(makePlan("subagent")),
    };

    const ruleActions = {
      parseArgs: (args: InstallRuleHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "rule",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ refs: [] }),
      buildPlan: () => Effect.succeed(makePlan("rule")),
    };

    const hookActions = {
      parseArgs: (args: InstallHookHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "hook",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ refs: [] }),
      buildPlan: () => Effect.succeed(makePlan("hook")),
    };

    const packActions = {
      parseArgs: (args: InstallPackHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "pack",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("pack")),
    };

    const knowledgeActions = {
      parseArgs: (args: InstallKnowledgeHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "knowledge",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({ refs: [] }),
      buildPlan: () => Effect.succeed(makePlan("knowledge")),
    };

    const coreLayer = Layer.mergeAll(
      ctx.fullLayer,
      CodingAgentRepositoryLive,
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallSkillCommandWorkflowActions,
        skillActions as unknown as ServiceMap.Service.Shape<
          typeof InstallSkillCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallMcpServerCommandWorkflowActions,
        mcpServerActions as unknown as ServiceMap.Service.Shape<
          typeof InstallMcpServerCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallSubagentCommandWorkflowActions,
        subagentActions as unknown as ServiceMap.Service.Shape<
          typeof InstallSubagentCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallRuleCommandWorkflowActions,
        ruleActions as unknown as ServiceMap.Service.Shape<
          typeof InstallRuleCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallHookCommandWorkflowActions,
        hookActions as unknown as ServiceMap.Service.Shape<
          typeof InstallHookCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallPackCommandWorkflowActions,
        packActions as unknown as ServiceMap.Service.Shape<
          typeof InstallPackCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallKnowledgeCommandWorkflowActions,
        knowledgeActions as unknown as ServiceMap.Service.Shape<
          typeof InstallKnowledgeCommandWorkflowActions
        >,
      ),
      Layer.succeed(SourceHostProviders, opts?.sources ?? selectedSourceHostProviders),
    );
    const managerLayer = Layer.provide(
      Layer.mergeAll(
        SkillManagerLive,
        SubagentManagerLive,
        RuleManagerLive,
        HookManagerLive,
        KnowledgeManagerLive,
      ),
      coreLayer,
    );
    const fullLayer = Layer.merge(coreLayer, managerLayer);

    return {
      provide: makeEffectProvide(fullLayer),
      logs: ctx.logs,
      rendererState: ctx.rendererState,
    };
  };

  it.effect("dispatches each supported FQN to the matching update surface", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const flags = {
        yes: false,
        force: false,
        preview: true,
      } satisfies RootUpdateFlags;
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { "code-review": "@acme/skills/code-review" },
        mcps: { "dev-server": "@acme/mcps/dev-server" },
        subagents: { researcher: "@acme/subagents/researcher" },
        rules: { "workspace-guidance": "@acme/rules/workspace-guidance" },
        hooks: { "tool-audit": "@acme/hooks/tool-audit" },
        knowledge: { handbook: "@acme/knowledge/handbook" },
      });

      const sources = [
        "@acme/skills/code-review",
        "@acme/mcps/dev-server",
        "@acme/subagents/researcher",
        "@acme/rules/workspace-guidance",
        "@acme/hooks/tool-audit",
        "@acme/knowledge/handbook",
        "@acme/packs/frontend-tools",
      ] as const;

      yield* Effect.forEach(sources, (source) =>
        provide(handleUpdate({ source: Option.some(source), ...flags })),
      );

      expect(calls).toEqual([
        { type: "skill", source: "@acme/skills/code-review@1.0.0", ...flags },
        { type: "mcp-server", source: "@acme/mcps/dev-server@1.0.0", ...flags },
        { type: "subagent", source: "@acme/subagents/researcher@1.0.0", ...flags },
        { type: "rule", source: "@acme/rules/workspace-guidance@1.0.0", ...flags },
        { type: "hook", source: "@acme/hooks/tool-audit@1.0.0", ...flags },
        { type: "knowledge", source: "@acme/knowledge/handbook@1.0.0", ...flags },
        { type: "pack", source: "@acme/packs/frontend-tools@1.0.0", ...flags },
      ]);
    }),
  );

  it.effect("rejects invalid FQN with guidance", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      const error = yield* provide(
        handleUpdate({
          source: Option.some("./local-path"),
          yes: false,
          force: false,
          preview: true,
        }).pipe(Effect.flip),
      );
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(calls).toHaveLength(0);
    }),
  );

  it.effect("accepts release-age bypass for an untargeted root update", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: false,
          force: false,
          preview: true,
          ignoreReleaseAge: true,
        }),
      );

      expect(calls).toEqual([]);
    }),
  );

  it.effect("blocks a non-desired target before Registry resolution", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      let registryCalls = 0;
      const { provide, rendererState } = makeLayers(calls, {
        machine: true,
        sources: {
          ...selectedSourceHostProviders,
          resolveNamedRegistry: (_source, options) =>
            Effect.sync(() => {
              registryCalls += 1;
              return {
                kind: "policy_held" as const,
                target: `${options.owner}/skills/${options.name}`,
                candidate: {
                  version: "2.0.0",
                  publishedAt: "2026-08-11T12:00:00.000Z",
                  eligibleAt: "2026-08-12T12:00:00.000Z",
                  minimumReleaseAgeSeconds: 86_400,
                },
              };
            }),
        },
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
      });

      yield* provide(
        handleUpdate({
          source: Option.some("@acme/skills/reviewer"),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          contract: "plan-result-v3",
          outcome: "blocked",
          blocking: {
            class: "precondition-unmet",
            causeCode: "conflict",
            reference: "not-desired",
          },
          counts: { total: 0 },
          targetedUpdate: {
            ownership: "absent",
            authority: "blocked",
            blocker: "not-desired",
          },
        },
      });
      expect(registryCalls).toBe(0);
      expect(calls).toEqual([]);
    }),
  );

  it.effect("previews a pack-only member update without creating direct intent", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      let requestedRange: string | undefined;
      const { provide, rendererState } = makeLayers(calls, {
        machine: true,
        sources: {
          ...selectedSourceHostProviders,
          resolveNamedRegistry: (source, options) => {
            requestedRange = Option.getOrUndefined(options.versionRange);
            return selectedSourceHostProviders.resolveNamedRegistry(source, options);
          },
        },
      });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@acme",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        packs: { toolkit: "workspace:@acme/packs/toolkit" },
      });
      const packDir = path.join(axmDir, "extensions", "@acme", "packs", "toolkit");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          dependencies: { "@acme/skills/reviewer": "^1.0.0" },
        }),
      );
      const settingsBefore = fs.readFileSync(path.join(axmDir, "settings.json"), "utf8");

      yield* provide(
        handleUpdate({
          source: Option.some("@acme/skills/reviewer"),
          yes: false,
          force: false,
          preview: true,
        }),
      );

      expect(requestedRange).toBe(">=1.0.0 <2.0.0-0");
      expect(calls).toEqual([]);
      expect(fs.readFileSync(path.join(axmDir, "settings.json"), "utf8")).toBe(settingsBefore);
      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          contract: "plan-result-v3",
          outcome: "previewed",
          mode: "preview",
          counts: { total: 1 },
          targetedUpdate: {
            ownership: "pack-only",
            authority: "pack-aware",
            packs: [
              {
                fqn: "@acme/packs/toolkit",
                configuredName: "toolkit",
                constraint: "^1.0.0",
              },
            ],
            effects: {
              settings: "unchanged",
              packRoot: "unchanged",
              packManifest: "unchanged",
            },
          },
        },
      });
    }),
  );

  it.effect("preserves trusted usable desired state for a targeted held release", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide, rendererState } = makeLayers(calls, {
        machine: true,
        sources: {
          ...selectedSourceHostProviders,
          resolveNamedRegistry: (_source, options) =>
            Effect.succeed({
              kind: "policy_held",
              target: `${options.owner}/skills/${options.name}`,
              candidate: {
                version: "2.0.0",
                publishedAt: "2026-08-11T12:00:00.000Z",
                eligibleAt: "2026-08-12T12:00:00.000Z",
                minimumReleaseAgeSeconds: 86_400,
              },
            }),
        },
      });
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "reviewer");
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "reviewer", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        "---\nname: reviewer\ndescription: Review code\n---\n\n# Reviewer\n",
      );
      const sourceHash = computePackageContentHashSync(skillDir);
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer@^1.0.0" },
        lockfileSkills: {
          reviewer: {
            type: "registry",
            owner: "@acme",
            name: "reviewer",
            resolvedVersion: "1.0.0",
            integrity: "sha512-reviewer",
            sourceName: "test",
            publisherBindingId: "publisher-binding",
            sourceHash,
            installedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        writeTrustFromLockfile: true,
      });

      yield* provide(
        handleUpdate({
          source: Option.some("@acme/skills/reviewer@^1.0.0"),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          contract: "plan-result-v3",
          outcome: "no-op",
          counts: { total: 0 },
          holdbacks: [
            {
              target: "@acme/skills/reviewer",
              requestedRange: "^1.0.0",
              currentVersion: "1.0.0",
              selectedVersion: "1.0.0",
              candidateVersion: "2.0.0",
            },
          ],
        },
      });
      expect(calls).toEqual([]);
    }),
  );

  it.effect("supplies the accepted Registry floor to targeted and workspace updates", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const acceptedRequests: Array<
        { readonly version: string; readonly publisherBindingId: string } | undefined
      > = [];
      const { provide } = makeLayers(calls, {
        machine: true,
        sources: {
          ...selectedSourceHostProviders,
          resolveNamedRegistry: (source, options) => {
            acceptedRequests.push(options.accepted);
            return selectedSourceHostProviders.resolveNamedRegistry(source, options).pipe(
              Effect.map((resolution) =>
                resolution.kind === "selected" && options.accepted !== undefined
                  ? {
                      ...resolution,
                      ref: {
                        ...resolution.ref,
                        version: decodeVersionSync(options.accepted.version),
                      },
                      newerHeld: {
                        version: "2.0.0",
                        publishedAt: "2026-08-11T12:00:00.000Z",
                        eligibleAt: "2026-08-12T12:00:00.000Z",
                        minimumReleaseAgeSeconds: 86_400,
                      },
                    }
                  : resolution,
              ),
            );
          },
        },
      });
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "reviewer");
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "reviewer", version: "1.5.0" }),
      );
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        "---\nname: reviewer\ndescription: Review code\n---\n\n# Reviewer\n",
      );
      const sourceHash = computePackageContentHashSync(skillDir);
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer@^1.0.0" },
        lockfileSkills: {
          reviewer: {
            type: "registry",
            owner: "@acme",
            name: "reviewer",
            resolvedVersion: "1.5.0",
            integrity: "sha512-reviewer",
            sourceName: "test",
            publisherBindingId: "publisher-binding",
            sourceHash,
            installedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        writeTrustFromLockfile: true,
      });

      yield* provide(
        handleUpdate({
          source: Option.some("@acme/skills/reviewer@^1.0.0"),
          yes: false,
          force: false,
          preview: true,
        }),
      );
      yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: false,
          force: false,
          preview: true,
        }),
      );

      expect(acceptedRequests).toEqual([
        { version: "1.5.0", publisherBindingId: "publisher-binding" },
        { version: "1.5.0", publisherBindingId: "publisher-binding" },
      ]);
      expect(calls).toContainEqual({
        type: "skill",
        source: "@acme/skills/reviewer@1.5.0",
        yes: false,
        force: false,
        preview: true,
      });
    }),
  );

  it.effect("records a one-shot targeted release-age bypass", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide, rendererState } = makeLayers(calls, {
        machine: true,
        sources: {
          ...selectedSourceHostProviders,
          resolveNamedRegistry: (source, options) =>
            selectedSourceHostProviders.resolveNamedRegistry(source, options).pipe(
              Effect.map((resolution) =>
                resolution.kind === "selected"
                  ? {
                      ...resolution,
                      kind: "exempted" as const,
                      exemption: { bypassCause: "ignore-flag" as const },
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
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer" },
      });

      yield* provide(
        handleUpdate({
          source: Option.some("@acme/skills/reviewer"),
          yes: true,
          force: false,
          preview: false,
          ignoreReleaseAge: true,
        }),
      );

      expect(rendererState.results[0]?.data).toMatchObject({
        result: {
          releaseAgeBypassCount: 1,
          releaseAgeBypasses: [
            {
              target: "@acme/skills/reviewer",
              selectedVersion: "1.0.0",
              candidateVersion: "1.0.0",
            },
          ],
        },
      });
      expect(calls).toEqual([
        {
          type: "skill",
          source: "@acme/skills/reviewer@1.0.0",
          yes: false,
          force: false,
          preview: true,
        },
      ]);
    }),
  );

  it.effect("emits JSON no-op when workspace has no configured extensions to update", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide, logs, rendererState } = makeLayers(calls, { machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(calls).toEqual([]);
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
      const calls: Array<UpdateCall> = [];
      const { provide, rendererState } = makeLayers(calls, { machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@axm",
        knowledge: { handbook: "workspace:@acme/knowledge/handbook" },
      });
      writeKnowledgeExtension(axmDir, "handbook");

      yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

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
      const calls: Array<UpdateCall> = [];
      const { provide, rendererState } = makeLayers(calls, {
        machine: true,
        sources: {
          find: () => Effect.die("unused"),
          resolveNamedRegistry: (_source, options) =>
            Effect.succeed({
              kind: "policy_held",
              target: `${options.owner}/packs/${options.name}`,
              candidate: {
                version: "1.0.0",
                publishedAt: "2026-08-11T12:00:00.000Z",
                eligibleAt: "2026-08-12T12:00:00.000Z",
                minimumReleaseAgeSeconds: 86_400,
              },
            }),
          fetch: () => Effect.die("unused"),
          cloneUrl: () => Option.none(),
          origin: () => "test registry",
        },
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        packs: { fresh: "@acme/packs/fresh" },
      });

      yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(calls).toEqual([]);
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

  it.effect("renders an actionable minimum-release-age section for people", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide, logs } = makeLayers(calls, {
        sources: {
          find: () => Effect.die("unused"),
          resolveNamedRegistry: (_source, options) =>
            Effect.succeed({
              kind: "policy_held",
              target: `${options.owner}/skills/${options.name}`,
              candidate: {
                version: "2.0.0",
                publishedAt: "2026-08-11T12:00:00.000Z",
                eligibleAt: "2026-08-12T12:00:00.000Z",
                minimumReleaseAgeSeconds: 86_400,
              },
            }),
          fetch: () => Effect.die("unused"),
          cloneUrl: () => Option.none(),
          origin: () => "test registry",
        },
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer" },
      });

      yield* provide(
        handleUpdate({ source: Option.none(), yes: true, force: false, preview: false }),
      );

      expect(logs.warn).toContain("1 newer release held by the 24h minimum release age");
      expect(logs.info).toContain(
        "@acme/skills/reviewer 2.0.0 published 2026-08-11T12:00:00.000Z, eligible 2026-08-12T12:00:00.000Z",
      );
      expect(logs.info.some((message) => message.includes("--ignore-release-age"))).toBe(true);
    }),
  );

  it.effect("names the exemption and both timestamps when a release skips the age gate", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide, logs } = makeLayers(calls, {
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
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { reviewer: "@acme/skills/reviewer" },
      });

      yield* provide(
        handleUpdate({ source: Option.none(), yes: true, force: false, preview: false }),
      );

      expect(logs.warn).toContain("1 release skipped the 24h minimum release age");
      expect(logs.info).toContain(
        "Selected @acme/skills/reviewer 1.0.0 ahead of its eligibility at 2026-08-12T12:00:00.000Z (published 2026-08-11T12:00:00.000Z) — exempt via minimumReleaseAgeExclude in project settings",
      );
    }),
  );

  it.effect("applies configured holdback handling to every installable extension type", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const plural = {
        skill: "skills",
        "mcp-server": "mcps",
        subagent: "subagents",
        rule: "rules",
        hook: "hooks",
        knowledge: "knowledge",
        pack: "packs",
      } as const;
      const { provide, rendererState } = makeLayers(calls, {
        machine: true,
        sources: {
          find: () => Effect.die("unused"),
          resolveNamedRegistry: (_source, options) =>
            Effect.succeed({
              kind: "policy_held",
              target: `${options.owner}/${plural[options.type]}/${options.name}`,
              candidate: {
                version: "1.0.0",
                publishedAt: "2026-08-11T12:00:00.000Z",
                eligibleAt: "2026-08-12T12:00:00.000Z",
                minimumReleaseAgeSeconds: 86_400,
              },
            }),
          fetch: () => Effect.die("unused"),
          cloneUrl: () => Option.none(),
          origin: () => "test registry",
        },
      });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        sources: [{ type: "registry", name: "test", location: "file:///tmp/test-registry" }],
        skills: { skill: "@acme/skills/skill" },
        mcps: { server: "@acme/mcps/server" },
        subagents: { subagent: "@acme/subagents/subagent" },
        rules: { rule: "@acme/rules/rule" },
        hooks: { hook: "@acme/hooks/hook" },
        knowledge: { knowledge: "@acme/knowledge/knowledge" },
        packs: { pack: "@acme/packs/pack" },
      });

      yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

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
      expect(calls).toEqual([]);
    }),
  );
});
