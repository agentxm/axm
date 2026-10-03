import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
/**
 * Unit tests for the list command handler.
 *
 * Tests the read-only display of installed skills with optional agent filtering.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { TestMachineRenderer, TestRenderer } from "../../test-support/presenter-test.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import {
  WorkspaceRecords,
  WorkspaceReadViews,
  countExtensionInventory,
  type WorkspaceStateOptions,
} from "@agentxm/workspace-kernel/workspace-state";
import { layer as coreWorkspaceLayer } from "@agentxm/workspace-kernel/workspace-state/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { expectNoPlanEnvelope } from "../../test-support/test-helpers.js";
import { paintText } from "../../screen/index.js";
import { handleList } from "./list.js";
import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  writeWorkspaceFiles(axmDir, { agents, lockfileSkills });
};

const makeLockEntry = (_agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "installed",
  contentIdentity: "test-content",
});

const createAgentSkill = (baseDir: string, agentId: "claude-code" | "cursor", name: string) => {
  const agentDir = agentId === "claude-code" ? ".claude" : ".cursor";
  const skillDir = path.join(baseDir, agentDir, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`);
};

const CLAUDE_SKILL_READERS = [
  "augment",
  "claude-code",
  "cline",
  "crush",
  "cursor",
  "firebender",
  "github-copilot-cli",
  "goose",
  "kilo",
  "minimax-code",
  "neovate",
  "ona",
  "opencode",
  "zencoder",
  "zenflow",
];

const CURSOR_SKILL_READERS = ["crush", "cursor", "firebender"];

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("list.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "list-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: {
    readonly machine?: boolean;
    readonly wsOverrides?: Partial<WorkspaceStateOptions>;
  }) => {
    const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
    const rendererLayer = renderer.layer;
    const rendererState = renderer.state;
    const BaseLayer = Layer.mergeAll(
      Layer.provideMerge(WorkspaceFileWriteLocksLive, NodeServices.layer),
      rendererLayer,
      TestFlagsLayer(),
    );
    const wsOptions: WorkspaceStateOptions = {
      scope: "project",
      ...opts?.wsOverrides,
      projectRoot: opts?.wsOverrides?.projectRoot ?? decodeAbsolutePathSync(tempDir),
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);
    const provide = Effect.provide(FullLayer);

    return { provide, rendererState };
  };

  // ---------------------------------------------------------------------------
  // Display all skills
  // ---------------------------------------------------------------------------

  it.effect("displays all installed skills", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(),
      "skill-two": makeLockEntry(),
    });
    createAgentSkill(tempDir, "claude-code", "skill-one");
    createAgentSkill(tempDir, "claude-code", "skill-two");

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 2,
          items: expect.arrayContaining([
            expect.objectContaining({ name: "skill-one" }),
            expect.objectContaining({ name: "skill-two" }),
          ]),
        });
      }),
    );
  });

  it.effect("keeps native outcomes and discovery uncertainty visible at 80 columns", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));
    const inventory = countExtensionInventory([
      {
        scope: "project",
        type: "skill",
        name: "review",
        classification: { kind: "lifecycle", lifecycle: "configured" },
        enabled: true,
        installed: true,
        agents: [...CLAUDE_SKILL_READERS, "amp", "codex", "kimi-cli", "gemini-cli", "windsurf"],
        origins: ["agent-skill-dir"],
        paths: [".claude/skills/review", ".cursor/skills/review"],
        agentOutcomes: [
          {
            extensionType: "skill",
            name: "review",
            agentId: "cursor",
            outcome: "current",
            reasonCode: "verified-native-unit",
            reason: "Owned native units are current.",
          },
        ],
        nativeLocations: [".claude/skills/review", ".cursor/skills/review"].map((entry) => ({
          scope: "project",
          address: { kind: "entry", path: entry },
          aliases: [entry],
          configuredConsumers: ["cursor"],
          potentialReaders: CLAUDE_SKILL_READERS,
          policyReasons: [],
          ownership: "owned",
          state: "retained",
          availability: [{ agentId: "cursor", state: "unverified" }],
        })),
        duplicateDiscoveries: [
          { agentId: "cursor", nativeUnitKeys: ["claude-entry", "cursor-entry"] },
        ],
      },
    ]);
    return provide(
      Effect.gen(function* () {
        const views = yield* WorkspaceReadViews;
        yield* handleList({ agents: [] }).pipe(
          Effect.provideService(WorkspaceReadViews, {
            capture: views.capture.pipe(
              Effect.map((readers) =>
                Context.add(readers, WorkspaceRecords, {
                  getInventory: () => Effect.succeed(inventory),
                  getExtensionInventory: () => Effect.succeed(inventory),
                  rows: () => Effect.succeed(inventory.items),
                }),
              ),
            ),
          }),
        );
        const output = rendererState.docs
          .filter((entry) => entry.channel === "stdout")
          .flatMap((entry) => paintText(entry.doc, { width: 80, colors: false }))
          .join("\n");
        for (const header of [
          "Configured agents",
          "Native locations",
          "Discovery",
          "Agent outcomes",
        ])
          expect(output).toContain(header);
        expect(output).toContain("cursor");
        expect(output).toContain("retained");
        expect(output).toContain("already");
        expect(output).toContain("available");
        expect(output).toContain("unverified");
        expect(output).not.toContain("github-copilot-cli");
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Empty lockfile
  // ---------------------------------------------------------------------------

  it.effect("shows no skills message when lockfile is empty", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.logs).toEqual([]);
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Filter by single agent
  // ---------------------------------------------------------------------------

  it.effect("filters skills by single agent", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      {
        "skill-claude": makeLockEntry(["claude-code"]),
        "skill-cursor": makeLockEntry(["cursor"]),
      },
      ["claude-code", "cursor"],
    );
    createAgentSkill(tempDir, "claude-code", "skill-claude");
    createAgentSkill(tempDir, "cursor", "skill-cursor");

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["claude-code"] });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 1,
          items: [expect.objectContaining({ name: "skill-claude", agents: CLAUDE_SKILL_READERS })],
        });
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Filter by multiple agents (OR logic)
  // ---------------------------------------------------------------------------

  it.effect("filters by multiple agents using OR logic", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(
      path.join(tempDir, ".axm"),
      {
        "skill-claude": makeLockEntry(["claude-code"]),
        "skill-cursor": makeLockEntry(["cursor"]),
        "skill-other": makeLockEntry(["other-agent"]),
      },
      ["claude-code", "cursor"],
    );
    createAgentSkill(tempDir, "claude-code", "skill-claude");
    createAgentSkill(tempDir, "cursor", "skill-cursor");

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["claude-code", "cursor"] });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 2,
          items: expect.arrayContaining([
            expect.objectContaining({ name: "skill-claude" }),
            expect.objectContaining({ name: "skill-cursor" }),
          ]),
        });
        expect(rendererState.results[0]?.data).not.toMatchObject({
          items: expect.arrayContaining([expect.objectContaining({ name: "skill-other" })]),
        });
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // Agent filter matches nothing
  // ---------------------------------------------------------------------------

  it.effect("shows empty message when agent filter matches nothing", () => {
    const { provide, rendererState } = makeLayers();
    initWorkspace(path.join(tempDir, ".axm"), {
      "skill-one": makeLockEntry(["claude-code"]),
    });

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: ["nonexistent-agent"] });

        expect(rendererState.results[0]?.data).toMatchObject({
          count: 0,
          items: [],
        });
        expect(rendererState.logs).toEqual([]);
      }),
    );
  });

  it.effect("emits machine-readable items for --json consumers", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    initWorkspace(
      path.join(tempDir, ".axm"),
      {
        "skill-one": makeLockEntry(),
        "skill-two": makeLockEntry(["cursor"]),
      },
      ["claude-code", "cursor"],
    );
    createAgentSkill(tempDir, "claude-code", "skill-one");
    createAgentSkill(tempDir, "cursor", "skill-two");

    return provide(
      Effect.gen(function* () {
        yield* handleList({ agents: [] });

        expect(rendererState.results).toHaveLength(1);
        expect(rendererState.results[0]?.data).toMatchObject({
          count: 2,
          installedCount: 2,
          items: [
            {
              name: "skill-one",
              agents: CLAUDE_SKILL_READERS,
              classification: { kind: "lifecycle", lifecycle: "unmanaged" },
            },
            {
              name: "skill-two",
              agents: CURSOR_SKILL_READERS,
              classification: { kind: "lifecycle", lifecycle: "unmanaged" },
            },
          ],
        });
        expectNoPlanEnvelope(rendererState.results[0]?.data);
      }),
    );
  });
});
