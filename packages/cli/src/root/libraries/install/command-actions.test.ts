import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { vi } from "vitest";

import { CommandManager } from "@agentxm/client-core/unstable/commands";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import type { RegistryLibraryLockEntry } from "@agentxm/client-core/unstable/lockfile";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { RegistryLibraryDetail } from "@agentxm/client-core/unstable/registry";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { buildRegistrySkillRef, SkillManager } from "@agentxm/client-core/unstable/skills";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";

import {
  exactVersion,
  extensionName,
  handle,
  makeBaseWorkspaceMock,
  resolvedExtensionMap,
} from "../../../test-stubs.js";
import {
  InstallLibraryCommandWorkflowActions,
  InstallLibraryCommandWorkflowActionsLive,
} from "./command-actions.js";

const testDate = new Date("2026-01-01T00:00:00.000Z");

const oldAddedAt = "2025-12-01T00:00:00.000Z";
const recentAddedAt = new Date().toISOString();

const lockedLibrary: RegistryLibraryLockEntry = {
  type: "registry",
  owner: handle("@acme"),
  name: extensionName("frontend"),
  sourceName: "default",
  installedAt: testDate,
  updatedAt: testDate,
  resolvedAt: testDate,
  membershipDigest: "sha256-test",
  resolvedSkills: resolvedExtensionMap({
    "@acme/skills/reviewer": "1.2.3",
  }),
  resolvedCommands: resolvedExtensionMap({
    "@acme/commands/release": "2.0.0",
  }),
  resolvedMcpServers: resolvedExtensionMap({}),
  resolvedSubagents: resolvedExtensionMap({}),
  resolvedFiles: resolvedExtensionMap({}),
  resolvedRules: resolvedExtensionMap({}),
  resolvedHooks: resolvedExtensionMap({}),
};

const workspace = makeBaseWorkspaceMock("/tmp/axm", {
  getLockedLibrary: (name) =>
    Effect.succeed(name === "frontend" ? Option.some(lockedLibrary) : Option.none()),
  getConfiguredSourceByName: (name) =>
    Effect.succeed(
      name === "default"
        ? Option.some({
            name: "default",
            type: "registry",
            location: new URL("https://registry.example.test"),
          })
        : Option.none(),
    ),
});

const registrySourceHost = {
  name: "default",
  type: "registry" as const,
  location: new URL("https://registry.example.test"),
};

const registrySource = {
  ...registrySourceHost,
  owner: Option.some(handle("@acme")),
};

const makeLibraryDetail = (args?: {
  readonly members?: RegistryLibraryDetail["members"];
  readonly hiddenMemberCount?: number;
}): RegistryLibraryDetail => ({
  library: {
    id: "library_01J00000000000000000000000",
    owner: handle("@acme"),
    name: extensionName("frontend"),
    title: "Frontend",
    description: null,
    visibility: "public",
    maintainer: { kind: "none", assignedAt: null, assignedBy: null },
    createdAt: oldAddedAt,
    updatedAt: oldAddedAt,
  },
  members: args?.members ?? [
    {
      id: "library_member_01J0000000000000000000000",
      libraryId: "library_01J00000000000000000000000",
      extensionId: "ext_01J00000000000000000000000",
      extensionOwner: handle("@acme"),
      extensionType: "skill",
      extensionName: extensionName("reviewer"),
      addedAt: oldAddedAt,
    },
  ],
  hiddenMemberCount: args?.hiddenMemberCount ?? 0,
});

const makeResolvedSkill = (name: string, version: string) =>
  buildRegistrySkillRef(
    handle("@acme"),
    extensionName(name),
    exactVersion(version),
    registrySource,
    [],
  );

const makeManager = <TType extends string>(type: TType) => ({
  type,
  isInstalled: vi.fn(() => Effect.succeed(false)),
  materializeInstall: vi.fn(() => Effect.void),
  listMaterializable: vi.fn(() => Effect.succeed([])),
  materializeUninstall: vi.fn(() => Effect.void),
  upsertSettingsEntry: vi.fn(() => Effect.void),
  removeSettingsEntry: vi.fn(() => Effect.void),
  upsertLockfileEntry: vi.fn(() => Effect.void),
  removeLockfileEntry: vi.fn(() => Effect.void),
});

const sourceHostProviders = {
  find: vi.fn(() => Effect.succeed([])),
  fetch: vi.fn(),
  cloneUrl: vi.fn(),
  origin: vi.fn(() => "test"),
} satisfies ServiceMap.Service.Shape<typeof SourceHostProviders>;

const makeActionsLayer = (args?: {
  readonly workspace?: WorkspaceMutationsService;
  readonly sourceHostProviders?: ServiceMap.Service.Shape<typeof SourceHostProviders>;
}) =>
  Layer.provide(
    InstallLibraryCommandWorkflowActionsLive,
    Layer.mergeAll(
      Layer.succeed(WorkspaceMutations, args?.workspace ?? workspace),
      Layer.succeed(
        SkillManager,
        makeManager("skill") satisfies ServiceMap.Service.Shape<typeof SkillManager>,
      ),
      Layer.succeed(
        CommandManager,
        makeManager("command") satisfies ServiceMap.Service.Shape<typeof CommandManager>,
      ),
      Layer.succeed(
        McpServerManager,
        makeManager("mcp-server") satisfies ServiceMap.Service.Shape<typeof McpServerManager>,
      ),
      Layer.succeed(
        SubagentManager,
        makeManager("subagent") satisfies ServiceMap.Service.Shape<typeof SubagentManager>,
      ),
      Layer.succeed(
        FilesManager,
        makeManager("files") satisfies ServiceMap.Service.Shape<typeof FilesManager>,
      ),
      Layer.succeed(
        RuleManager,
        makeManager("rule") satisfies ServiceMap.Service.Shape<typeof RuleManager>,
      ),
      Layer.succeed(
        HookManager,
        makeManager("hook") satisfies ServiceMap.Service.Shape<typeof HookManager>,
      ),
      Layer.succeed(SourceHostProviders, args?.sourceHostProviders ?? sourceHostProviders),
      NodeServices.layer,
      TestFlagsLayer(),
    ),
  );

const runWithActions = <A, E>(
  fn: (
    actions: ServiceMap.Service.Shape<typeof InstallLibraryCommandWorkflowActions>,
  ) => Effect.Effect<A, E>,
  options?: {
    readonly workspace?: WorkspaceMutationsService;
    readonly sourceHostProviders?: ServiceMap.Service.Shape<typeof SourceHostProviders>;
  },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallLibraryCommandWorkflowActions;
    return yield* fn(actions);
  }).pipe(Effect.provide(makeActionsLayer(options)));

const runStep = (step: PlannedJobStep) => {
  if (step.readiness !== "ready") {
    throw new Error(`Expected ready step, got ${step.readiness}`);
  }
  return step.run;
};

const firstJobSteps = (plan: Plan) => plan.jobs[0]?.steps ?? [];

describe("InstallLibraryCommandWorkflowActions", () => {
  it.effect("replays locked Library members in frozen mode without source resolution", () =>
    Effect.gen(function* () {
      const registryRoot = path.join("/tmp", `axm-frozen-library-${crypto.randomUUID()}`);
      for (const [type, name, publisherBindingId, version] of [
        ["skills", "reviewer", "hbnd_reviewer", "1.2.3"],
        ["commands", "release", "hbnd_release", "2.0.0"],
      ] as const) {
        const extensionDir = path.join(registryRoot, "extensions", "@acme", type, name);
        fs.mkdirSync(extensionDir, { recursive: true });
        fs.writeFileSync(
          path.join(extensionDir, "index.json"),
          JSON.stringify({
            owner: "@acme",
            type: type === "skills" ? "skill" : "command",
            name,
            publisherBindingId,
            versions: [
              {
                version,
                published: "2025-01-01T00:00:00Z",
                integrity: `sha512-${name}`,
              },
            ],
          }),
        );
      }
      const getMinimumReleaseAge = vi.fn(() => Effect.succeed("24h"));
      const setLibrary = vi.fn(() => Effect.void);
      const frozenWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
        ...workspace,
        getMinimumReleaseAge,
        setLibrary,
        getLockedSkills: () =>
          Effect.succeed({
            reviewer: {
              type: "registry",
              owner: handle("@acme"),
              name: extensionName("reviewer"),
              resolvedVersion: exactVersion("1.2.3"),
              integrity: "sha512-reviewer",
              sourceName: "default",
              publisherBindingId: "hbnd_reviewer",
              agents: [],
              installedAt: testDate,
              updatedAt: testDate,
            },
          }),
        getLockedCommands: () =>
          Effect.succeed({
            release: {
              type: "registry",
              owner: handle("@acme"),
              name: extensionName("release"),
              resolvedVersion: exactVersion("2.0.0"),
              integrity: "sha512-release",
              sourceName: "default",
              publisherBindingId: "hbnd_release",
              agents: [],
              installedAt: testDate,
              updatedAt: testDate,
            },
          }),
        getConfiguredSourceByName: (name) =>
          Effect.succeed(
            name === "default"
              ? Option.some({
                  name: "default",
                  type: "registry",
                  location: pathToFileURL(registryRoot),
                })
              : Option.none(),
          ),
      });
      const intent = yield* runWithActions(
        (actions) =>
          Effect.scoped(
            Effect.gen(function* () {
              const parsed = yield* actions.parseArgs({
                source: "@acme/libraries/frontend",
                unattended: true,
                frozen: true,
              });
              const requests = yield* actions.resolveSourceRequests(parsed);
              const discovered = yield* actions.discoverRefs(requests);
              return yield* actions.finalizeIntent(parsed, discovered);
            }),
          ),
        { workspace: frozenWorkspace },
      );

      expect(intent.mode).toBe("frozen");
      expect(sourceHostProviders.find).not.toHaveBeenCalled();
      expect(getMinimumReleaseAge).not.toHaveBeenCalled();
      expect(intent.membersToInstall).toHaveLength(2);
      expect(intent.membersToInstall).toEqual([
        expect.objectContaining({
          type: "skill",
          refType: "registry",
          owner: handle("@acme"),
          name: extensionName("reviewer"),
          version: exactVersion("1.2.3"),
        }),
        expect.objectContaining({
          type: "command",
          refType: "registry",
          owner: handle("@acme"),
          name: extensionName("release"),
          version: exactVersion("2.0.0"),
        }),
      ]);

      const plan = yield* runWithActions((actions) => actions.buildPlan(intent), {
        workspace: frozenWorkspace,
      });
      expect(firstJobSteps(plan).map((step) => step.key)).not.toContain(
        "library:@acme/libraries/frontend",
      );
      expect(setLibrary).not.toHaveBeenCalled();
      fs.rmSync(registryRoot, { recursive: true, force: true });
    }),
  );

  it.effect("records Library subscriptions with lockfile snapshot and hidden-member notice", () =>
    Effect.gen(function* () {
      const setLibrary = vi.fn(() => Effect.void);
      const liveWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
        getRegistrySourceHosts: () => Effect.succeed([registrySourceHost]),
        setLibrary,
      });
      const sourceProviders = {
        ...sourceHostProviders,
        find: vi.fn(() => Effect.succeed([makeResolvedSkill("reviewer", "1.2.3")])),
      } satisfies ServiceMap.Service.Shape<typeof SourceHostProviders>;

      const intent = yield* runWithActions(
        (actions) =>
          Effect.scoped(
            Effect.gen(function* () {
              const parsed = yield* actions.parseArgs({
                source: "@acme/libraries/frontend",
                unattended: false,
              });
              const requests = yield* actions.resolveSourceRequests(parsed);
              const request = requests[0];
              if (request === undefined) {
                throw new Error("Expected Library source request");
              }
              return yield* actions.finalizeIntent(parsed, [
                {
                  mode: "live",
                  library: makeLibraryDetail({ hiddenMemberCount: 2 }),
                  request,
                },
              ]);
            }),
          ),
        { workspace: liveWorkspace, sourceHostProviders: sourceProviders },
      );
      const plan = yield* runWithActions((actions) => actions.buildPlan(intent), {
        workspace: liveWorkspace,
        sourceHostProviders: sourceProviders,
      });
      const subscriptionStep = firstJobSteps(plan).find(
        (step) => step.key === "library:@acme/libraries/frontend",
      );
      if (subscriptionStep === undefined) {
        throw new Error("Expected Library subscription step");
      }

      const result = yield* runStep(subscriptionStep);

      expect(result).toEqual(
        expect.objectContaining({
          result: "success",
          message: "Recorded Library subscription",
          warnings: [
            "2 Library member(s) were not visible with the current registry credentials and were skipped.",
          ],
        }),
      );
      expect(setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "@acme/libraries/frontend",
          owner: handle("@acme"),
          name: extensionName("frontend"),
          sourceName: "default",
          membershipDigest: expect.stringMatching(/^sha256-/),
          resolvedSkills: resolvedExtensionMap({
            "@acme/skills/reviewer": "1.2.3",
          }),
        }),
      );
    }),
  );

  it.effect("skips Library members added inside minimumReleaseAge during unattended install", () =>
    Effect.gen(function* () {
      const setLibrary = vi.fn(() => Effect.void);
      const liveWorkspace = makeBaseWorkspaceMock("/tmp/axm", {
        getRegistrySourceHosts: () => Effect.succeed([registrySourceHost]),
        getMinimumReleaseAge: () => Effect.succeed("24h"),
        setLibrary,
      });
      const sourceProviders = {
        ...sourceHostProviders,
        find: vi.fn(() => Effect.succeed([makeResolvedSkill("reviewer", "1.2.3")])),
      } satisfies ServiceMap.Service.Shape<typeof SourceHostProviders>;

      const intent = yield* runWithActions(
        (actions) =>
          Effect.scoped(
            Effect.gen(function* () {
              const parsed = yield* actions.parseArgs({
                source: "@acme/libraries/frontend",
                unattended: true,
              });
              const requests = yield* actions.resolveSourceRequests(parsed);
              const request = requests[0];
              if (request === undefined) {
                throw new Error("Expected Library source request");
              }
              return yield* actions.finalizeIntent(parsed, [
                {
                  mode: "live",
                  library: makeLibraryDetail({
                    members: [
                      {
                        id: "library_member_01J0000000000000000000000",
                        libraryId: "library_01J00000000000000000000000",
                        extensionId: "ext_01J00000000000000000000000",
                        extensionOwner: handle("@acme"),
                        extensionType: "skill",
                        extensionName: extensionName("reviewer"),
                        addedAt: oldAddedAt,
                      },
                      {
                        id: "library_member_01J0000000000000000000001",
                        libraryId: "library_01J00000000000000000000000",
                        extensionId: "ext_01J00000000000000000000001",
                        extensionOwner: handle("@acme"),
                        extensionType: "skill",
                        extensionName: extensionName("beta"),
                        addedAt: recentAddedAt,
                      },
                    ],
                  }),
                  request,
                },
              ]);
            }),
          ),
        { workspace: liveWorkspace, sourceHostProviders: sourceProviders },
      );

      expect(intent.membersToInstall).toEqual([
        expect.objectContaining({
          type: "skill",
          owner: handle("@acme"),
          name: extensionName("reviewer"),
          version: exactVersion("1.2.3"),
        }),
      ]);
      expect(intent.skippedMemberMessages).toEqual([
        "@acme/skills/beta was added to the Library more recently than minimumReleaseAge 24h and was skipped.",
      ]);

      const plan = yield* runWithActions((actions) => actions.buildPlan(intent), {
        workspace: liveWorkspace,
        sourceHostProviders: sourceProviders,
      });
      const subscriptionStep = firstJobSteps(plan).find(
        (step) => step.key === "library:@acme/libraries/frontend",
      );
      if (subscriptionStep === undefined) {
        throw new Error("Expected Library subscription step");
      }

      const result = yield* runStep(subscriptionStep);

      expect(result).toEqual(
        expect.objectContaining({
          result: "success",
          warnings: [
            "@acme/skills/beta was added to the Library more recently than minimumReleaseAge 24h and was skipped.",
          ],
        }),
      );
      expect(setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedSkills: resolvedExtensionMap({
            "@acme/skills/reviewer": "1.2.3",
          }),
        }),
      );
    }),
  );
});
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
