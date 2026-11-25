import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import {
  SettingsReader,
  WorkspaceRecords,
  WorkspaceLocation,
  createDefaultSettings,
  countExtensionInventory,
  resolveProjectWorkspaceLayout,
  type ConfiguredRecordRow,
} from "../workspace-state/index.js";
import { WorkspaceReadTest, configuredRow, handle } from "../workspace-state/testing.js";
import { listMaterializableFromDisk, makeBaseManagerMembers } from "./manager-kit.js";

describe("shared manager members", () => {
  it.effect("reads installed and configured state and refuses a missing retained canonical", () =>
    Effect.gen(function* () {
      const records = yield* WorkspaceRecords;
      const settings = yield* SettingsReader;
      const members = makeBaseManagerMembers({
        location: yield* WorkspaceLocation,
        type: "hook",
        spanPrefix: "HookManager",
        records,
        settings,
        refName: (ref) => ref.hook.name,
        materializeInstall: () => Effect.die("No install expected"),
      });

      expect(yield* members.isInstalled({ target: { type: "hook", name: "audit" } })).toBe(true);
      expect(yield* members.isInstalled({ target: { type: "hook", name: "missing" } })).toBe(false);
      expect(
        yield* members.getConfiguredSource({ target: { type: "hook", name: "audit" } }),
      ).toEqual(Option.some("./source-hook"));
      expect(
        yield* members.getConfiguredSource({ target: { type: "hook", name: "missing" } }),
      ).toEqual(Option.none());
      expect(
        yield* members.withdrawnResolutionKeys({ target: { type: "hook", name: "audit" } }),
      ).toEqual(["audit"]);
      const failure = yield* members
        .materializeRetained({
          target: { type: "hook", name: "audit" },
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "LifecyclePostconditionViolated",
        postcondition: "materialize-observable",
        targetType: "hook",
        targetName: "audit",
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          WorkspaceReadTest({
            baseDir: "/workspace",
            settings: {
              ...createDefaultSettings(),
              hooks: { audit: { source: "./source-hook", enabled: true } },
            },
            records: {
              getExtensionInventory: () =>
                Effect.succeed(
                  countExtensionInventory([
                    {
                      ...configuredRow({ type: "hook", name: "audit", source: "./source-hook" }),
                      agentOutcomes: [],
                    },
                  ]),
                ),
            },
          }),
          NodeServices.layer,
        ),
      ),
    ),
  );
});

describe("materializable refs from disk", () => {
  const writeJson = (filePath: string, value: unknown) => {
    nodeFs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
    nodeFs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  };

  const writeAuthoredSkill = (baseDir: string) => {
    writeJson(nodePath.join(baseDir, "skills/review/skill.json"), {
      owner: "@acme",
      type: "skill",
      name: "review",
      version: "1.0.0",
    });
    nodeFs.mkdirSync(nodePath.join(baseDir, "skills/review/src"), { recursive: true });
    nodeFs.writeFileSync(nodePath.join(baseDir, "skills/review/src/SKILL.md"), "# Review\n");
  };

  /** List `type` refs from `configured` in a fresh project workspace prepared by `prepare`. */
  const listFromDisk = <T extends "skill" | "mcp-server" | "subagent">(
    type: T,
    configured: Readonly<Record<string, ConfiguredRecordRow>>,
    prepare: (baseDir: string) => void = () => undefined,
  ) =>
    Effect.acquireUseRelease(
      Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-disk-refs-"))),
      (baseDir) =>
        Effect.gen(function* () {
          prepare(baseDir);
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, baseDir), {
            owner: handle("@acme"),
          });
          const records = yield* WorkspaceRecords;
          return yield* listMaterializableFromDisk({
            type,
            records,
            configured,
            env: { fs, path, scope: "project", layout },
          });
        }).pipe(Effect.provide(WorkspaceReadTest({ baseDir }))),
      (baseDir) => Effect.sync(() => nodeFs.rmSync(baseDir, { recursive: true, force: true })),
    ).pipe(Effect.provide(NodeServices.layer));

  it.effect("resolves an enabled workspace entry to its authored ref", () =>
    Effect.gen(function* () {
      const refs = yield* listFromDisk(
        "skill",
        { review: configuredRow({ type: "skill", name: "review", source: "workspace" }) },
        writeAuthoredSkill,
      );
      expect(refs).toMatchObject([
        { type: "skill", refType: "workspace", name: "review", version: "1.0.0" },
      ]);
    }),
  );

  it.effect("does not reconstruct refs for entries whose source is not the workspace", () =>
    Effect.gen(function* () {
      const writeAcquired = (baseDir: string) => {
        writeJson(nodePath.join(baseDir, "agent_extensions/@acme/skills/review/skill.json"), {
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        });
        writeJson(nodePath.join(baseDir, "agent_extensions/@acme/mcps/browser/mcp.json"), {
          owner: "@acme",
          type: "mcp-server",
          name: "browser",
          version: "1.0.0",
          server: {
            name: "io.github.acme/browser",
            description: "Browser MCP server",
            version: "1.0.0",
          },
        });
        writeJson(
          nodePath.join(baseDir, "agent_extensions/@acme/subagents/planner/subagent.json"),
          {
            owner: "@acme",
            type: "subagent",
            name: "planner",
            version: "1.0.0",
            description: "Plan supplied work",
            core: { instructions: "src/planner.md" },
          },
        );
      };
      const listed = yield* Effect.all([
        listFromDisk(
          "skill",
          {
            review: configuredRow({ type: "skill", name: "review", source: "@acme/skills/review" }),
          },
          writeAcquired,
        ),
        listFromDisk(
          "mcp-server",
          {
            browser: configuredRow({
              type: "mcp-server",
              name: "browser",
              source: "@acme/mcps/browser",
            }),
          },
          writeAcquired,
        ),
        listFromDisk(
          "subagent",
          {
            planner: configuredRow({
              type: "subagent",
              name: "planner",
              source: "@acme/subagents/planner",
            }),
            stale: configuredRow({
              type: "subagent",
              name: "stale",
              source: "@acme/subagents/stale",
            }),
          },
          writeAcquired,
        ),
      ]);
      expect(listed).toEqual([[], [], []]);
    }),
  );

  it.effect("skips a disabled workspace entry", () =>
    Effect.gen(function* () {
      const refs = yield* listFromDisk(
        "skill",
        {
          review: configuredRow({
            type: "skill",
            name: "review",
            source: "workspace",
            enabled: false,
          }),
        },
        writeAuthoredSkill,
      );
      expect(refs).toEqual([]);
    }),
  );
});
