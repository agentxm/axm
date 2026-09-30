import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeAgentMembershipFixture,
  type AgentMembershipFixture,
} from "../../test-support/agent-membership-fixture.js";
import { handleAgentsAdd } from "./add.js";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import { handleAgentsRemove } from "./remove.js";
import { handleSync } from "../sync/handler.js";
import { PlanResolutionDocumentSchema } from "../../operation-output.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/removes-membership-and-owned-outputs",
  title: "Removing a coding agent retires it together with the outputs only it reached",
  statement:
    "When a coding agent is removed from the workspace, AXM shall remove it from the durable agent set and remove the owned outputs no remaining configured agent reaches in one operation, shall leave every remaining agent's realization untouched, and shall report retained physical units with the remaining readers or shared policy that requires them. AXM shall refuse and restore the membership change when readback finds an owned output that should have been retired still present or a retained required unit that no longer matches desired content.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Retiring membership belongs to the configuration feature and cleaning up the departing agent's outputs to the reconciliation feature, so the application layer that composes both is the lowest layer at which one operation does both; the outputs it removes are entries in a real directory.",
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [
    "Claude Code declares its own project skills directory while Amp declares the shared `.agents/skills` directory, so one workspace can hold both a single-claimant and a shared agent surface.",
  ],
  openQuestions: [],
});

const SKILL = "code-review";
const SKILL_BODY = `---\nname: ${SKILL}\ndescription: The ${SKILL} skill.\n---\n\n# ${SKILL}\n`;
const SKILL_MANIFEST = `${JSON.stringify(
  {
    owner: "@acme",
    type: "skill",
    name: SKILL,
    version: "1.0.0",
    description: `The ${SKILL} skill.`,
  },
  null,
  2,
)}\n`;

describe("Removing a coding agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one enabled Skill realized for both configured agents. */
  const workspaceWithAgents = (second: string, secondSkillsDir: string): AgentMembershipFixture => {
    const fixture = makeAgentMembershipFixture({
      settings: {
        agents: ["claude-code", second],
        owner: "@acme",
        skills: { [SKILL]: { source: "workspace", enabled: true } },
      },
      files: {
        [`skills/${SKILL}/skill.json`]: SKILL_MANIFEST,
        [`skills/${SKILL}/src/SKILL.md`]: SKILL_BODY,
      },
    });
    cleanups.push(fixture.cleanup);
    // Claude Code's own directory and the shared one the workspace already
    // realizes into; the second agent adds a directory only when it declares
    // one of its own.
    for (const directory of new Set([".claude/skills", ".agents/skills", secondSkillsDir])) {
      fixture.link(`${directory}/${SKILL}`, `skills/${SKILL}/src`);
    }
    return fixture;
  };

  const removeAgent = (fixture: AgentMembershipFixture, id: string) =>
    fixture.provide(handleAgentsRemove({ ids: [id], force: false, preview: false }));

  it.effect(
    "refuses membership removal when a native retirement reports success without removing its file",
    () => {
      const nativePath = ".opencode/agents/planner.md";
      const content =
        "<!-- axm:file v=1 ext=@acme/subagents/planner src=subagents/planner/src/planner.md -->\n---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n";
      let retirementAttempted = false;
      const fixture = makeAgentMembershipFixture({
        machine: true,
        settings: {
          owner: "@acme",
          agents: ["claude-code", "opencode"],
          subagents: { planner: { source: "workspace", enabled: true } },
        },
        files: {
          "subagents/planner/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "planner",
            version: "1.0.0",
            description: "Plans work",
          }),
          "subagents/planner/src/planner.md":
            "---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n",
          [nativePath]: content,
          ".claude/agents/planner.md": content,
        },
        fileSystemLayer: Layer.effect(
          FileSystem.FileSystem,
          Effect.map(FileSystem.FileSystem, (fs) =>
            FileSystem.make({
              ...fs,
              remove: (path, options) =>
                path.endsWith(`/${nativePath}`)
                  ? Effect.sync(() => {
                      retirementAttempted = true;
                    })
                  : fs.remove(path, options),
            }),
          ),
        ),
      });
      cleanups.push(fixture.cleanup);
      const settingsBefore = fixture.readFile("axm.json");
      return Effect.gen(function* () {
        yield* removeAgent(fixture, "opencode");
        expect(retirementAttempted).toBe(true);
        expect(fixture.readFile("axm.json")).toBe(settingsBefore);
        expect(fixture.readFile(nativePath)).toBe(content);
        expect(fixture.readFile(".claude/agents/planner.md")).toBe(content);
        expect(fixture.rendererState.results.at(-1)).not.toMatchObject({
          data: { result: { outcome: "applied" } },
        });
      });
    },
  );

  it.effect("retains a previously rewritten Subagent body while removing another agent", () => {
    const fixture = makeAgentMembershipFixture({
      machine: true,
      settings: {
        owner: "@acme",
        agents: [],
        subagents: { planner: { source: "workspace", enabled: true } },
      },
      files: {
        "subagents/planner/subagent.json": JSON.stringify({
          owner: "@acme",
          type: "subagent",
          name: "planner",
          version: "1.0.0",
          description: "Plans work",
        }),
        "subagents/planner/src/planner.md":
          "---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n",
      },
    });
    cleanups.push(fixture.cleanup);
    return Effect.gen(function* () {
      yield* fixture.provide(
        handleAgentsAdd({
          ids: ["claude-code", "opencode"],
          detected: false,
          force: false,
          preview: false,
        }),
      );
      const nativePath = ".claude/agents/planner.md";
      const original = fixture.readFile(nativePath);
      const rewritten = original.replace("Plan carefully", "Repository-formatted body");
      expect(rewritten).not.toBe(original);
      fixture.writeFile(nativePath, rewritten);
      yield* removeAgent(fixture, "opencode");
      expect(fixture.readSettings()["agents"]).toEqual(["claude-code"]);
      expect(fixture.readFile(nativePath)).toBe(rewritten);
      expect(fixture.exists(".opencode/agents/planner.md")).toBe(false);
      expect(fixture.rendererState.results.at(-1)).toMatchObject({
        data: { result: { outcome: "applied" } },
      });
    });
  });

  it.effect.each(["body", "ownership marker"] as const)(
    "restores membership when a retained native Subagent %s changes before final validation",
    (change) => {
      const retainedPath = ".claude/agents/planner.md";
      let foreign = "";
      let changed = false;
      let armed = false;
      const fixture = makeAgentMembershipFixture({
        machine: true,
        settings: {
          owner: "@acme",
          agents: [],
          subagents: { planner: { source: "workspace", enabled: true } },
        },
        files: {
          "subagents/planner/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "planner",
            version: "1.0.0",
            description: "Plans work",
          }),
          "subagents/planner/src/planner.md":
            "---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n",
        },
        fileSystemLayer: Layer.effect(
          FileSystem.FileSystem,
          Effect.map(FileSystem.FileSystem, (fs) =>
            FileSystem.make({
              ...fs,
              rename: (source, target) =>
                fs.rename(source, target).pipe(
                  Effect.andThen(
                    Effect.suspend(() => {
                      if (!armed || changed || !target.endsWith("/axm.json")) return Effect.void;
                      changed = true;
                      return fs.writeFileString(
                        target.slice(0, -"axm.json".length) + retainedPath,
                        foreign,
                      );
                    }),
                  ),
                ),
            }),
          ),
        ),
      });
      cleanups.push(fixture.cleanup);
      return Effect.gen(function* () {
        yield* fixture.provide(
          handleAgentsAdd({
            ids: ["claude-code", "opencode"],
            detected: false,
            force: false,
            preview: false,
          }),
        );
        const inventory = yield* fixture.provide(
          Effect.flatMap(WorkspaceRecords, (records) =>
            records.getExtensionInventory("subagent", {}),
          ),
        );
        expect(
          inventory.items
            .find((item) => item.name === "planner")
            ?.agentOutcomes.every((outcome) => outcome.outcome === "current"),
        ).toBe(true);
        const settingsBefore = fixture.readFile("axm.json");
        const departingBefore = fixture.readFile(".opencode/agents/planner.md");
        const retainedBefore = fixture.readFile(retainedPath);
        foreign =
          change === "body"
            ? retainedBefore.replace("Plan carefully", "Foreign instructions")
            : retainedBefore.replace(/<!-- axm:file[\s\S]*?-->/g, "");
        expect(foreign).not.toBe(retainedBefore);
        armed = true;
        yield* removeAgent(fixture, "opencode");
        expect(changed).toBe(true);
        expect(fixture.readFile("axm.json")).toBe(settingsBefore);
        expect(fixture.readFile(retainedPath)).toBe(foreign);
        expect(fixture.readFile(".opencode/agents/planner.md")).toBe(departingBefore);
        expect(fixture.rendererState.results.at(-1)).not.toMatchObject({
          data: { result: { outcome: "applied" } },
        });
      });
    },
  );

  const instructionSettings = {
    owner: "@acme",
    agents: ["claude-code", "codex"],
    instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
    rules: { guide: { source: "workspace", enabled: true } },
    knowledge: { reference: { source: "workspace", enabled: true } },
  };
  const instructionFiles = {
    "rules/guide/rule.json": JSON.stringify({
      owner: "@acme",
      type: "rule",
      name: "guide",
      version: "1.0.0",
      description: "Repository guidance",
    }),
    "rules/guide/src/RULE.md": "Keep every change reviewable.\n",
    "knowledge/reference/knowledge.json": JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name: "reference",
      version: "1.0.0",
      description: "Reference knowledge",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
    "knowledge/reference/src/index.md":
      '---\nokf_version: "0.2"\ndescription: Reference knowledge\n---\n\n# Reference\n',
  };

  it.effect.each([
    { kind: "Rules", body: "Keep every change reviewable." },
    { kind: "Knowledge", body: "Reference knowledge" },
  ])("restores membership when retained $kind content changes during removal", ({ body }) => {
    let armed = false;
    let changed = false;
    let foreign = "";
    const fixture = makeAgentMembershipFixture({
      machine: true,
      settings: instructionSettings,
      files: instructionFiles,
      fileSystemLayer: Layer.effect(
        FileSystem.FileSystem,
        Effect.map(FileSystem.FileSystem, (fs) =>
          FileSystem.make({
            ...fs,
            rename: (source, target) =>
              fs.rename(source, target).pipe(
                Effect.andThen(
                  Effect.suspend(() => {
                    if (!armed || changed || !target.endsWith("/axm.json")) return Effect.void;
                    changed = true;
                    return fs.writeFileString(
                      target.slice(0, -"axm.json".length) + "AGENTS.md",
                      foreign,
                    );
                  }),
                ),
              ),
          }),
        ),
      ),
    });
    cleanups.push(fixture.cleanup);
    return Effect.gen(function* () {
      yield* fixture.provide(handleSync({ preview: false }));
      const synced = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        fixture.rendererState.results.at(-1)?.data,
      );
      expect(synced.result.outcome).toBe("applied");
      const settingsBefore = fixture.readFile("axm.json");
      const retainedBefore = fixture.readFile("AGENTS.md");
      expect(fixture.readFile("CLAUDE.md")).toBe(retainedBefore);
      expect(retainedBefore).toContain(body);
      foreign = retainedBefore.replace(body, "Foreign changed content");
      expect(foreign).not.toBe(retainedBefore);
      armed = true;
      yield* removeAgent(fixture, "claude-code");
      const removed = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        fixture.rendererState.results.at(-1)?.data,
      );
      expect(changed).toBe(true);
      expect(removed.result.outcome).not.toBe("applied");
      expect(fixture.readFile("axm.json")).toBe(settingsBefore);
      expect(fixture.readFile("AGENTS.md")).toBe(foreign);
      // The external region edit survives; the transaction restores its own alias retirement.
      expect(fixture.readFile("CLAUDE.md")).toBe(foreign);
    });
  });

  it.effect(
    "removes a departing instruction alias while preserving both required shared regions",
    () => {
      const fixture = makeAgentMembershipFixture({
        machine: true,
        settings: instructionSettings,
        files: instructionFiles,
      });
      cleanups.push(fixture.cleanup);
      return Effect.gen(function* () {
        yield* fixture.provide(handleSync({ preview: false }));
        const synced = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          fixture.rendererState.results.at(-1)?.data,
        );
        expect(synced.result.outcome).toBe("applied");
        const retainedBefore = fixture.readFile("AGENTS.md");
        expect(fixture.readFile("CLAUDE.md")).toBe(retainedBefore);
        yield* removeAgent(fixture, "claude-code");
        const removed = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          fixture.rendererState.results.at(-1)?.data,
        );
        expect(removed.result.outcome).toBe("applied");
        expect(fixture.readSettings()["agents"]).toEqual(["codex"]);
        expect(fixture.exists("CLAUDE.md")).toBe(false);
        expect(fixture.readFile("AGENTS.md")).toBe(retainedBefore);
        expect(removed.result.nativeLocations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              address: { kind: "entry", path: `${fixture.root}/CLAUDE.md` },
              state: "removed",
            }),
          ]),
        );
        const retainedRegions = removed.result.nativeLocations.filter(
          (unit) =>
            unit.address.kind === "region" &&
            (unit.address.region === "rules" || unit.address.region === "knowledge"),
        );
        expect(retainedRegions).toHaveLength(2);
        for (const region of retainedRegions) {
          expect(region.state).toBe("retained");
          expect(region.configuredConsumers).toEqual(["codex"]);
          expect(region.aliases).toContain(`${fixture.root}/AGENTS.md`);
          expect(region.aliases).not.toContain(`${fixture.root}/CLAUDE.md`);
        }
      });
    },
  );

  it.effect(
    "removing an agent removes it from the target set together with its managed outputs",
    () => {
      const fixture = workspaceWithAgents("opencode", ".opencode/skills");
      expect(fixture.exists(`.opencode/skills/${SKILL}`)).toBe(true);

      return Effect.gen(function* () {
        yield* removeAgent(fixture, "opencode");

        expect(fixture.readSettings()).toMatchObject({ agents: ["claude-code"] });
        expect(fixture.exists(`.opencode/skills/${SKILL}`)).toBe(false);
        // The remaining agent's realization is untouched by the change.
        expect(fixture.exists(`.claude/skills/${SKILL}`)).toBe(true);
      });
    },
  );

  it.effect(
    "reports retention when the remaining agent reads the departing agent's location",
    () => {
      const fixture = workspaceWithAgents("cursor", ".cursor/skills");
      return Effect.gen(function* () {
        yield* removeAgent(fixture, "claude-code");
        expect(fixture.exists(`.claude/skills/${SKILL}`)).toBe(true);
        expect(fixture.exists(`.agents/skills/${SKILL}`)).toBe(true);
        expect(fixture.readSettings()).toMatchObject({ agents: ["cursor"] });
        expect(JSON.stringify(fixture.rendererState.results.at(-1))).toContain(
          '"state":"retained"',
        );
        expect(JSON.stringify(fixture.rendererState.results.at(-1))).toContain(
          '"configuredConsumers":["cursor"]',
        );
        expect(JSON.stringify(fixture.rendererState.results.at(-1))).toContain(
          "Still required by configured consumers",
        );
      });
    },
  );

  it.effect(
    "removing one claimant preserves an owned projection in a shared agent directory",
    () => {
      // Amp reads the shared `.agents/skills` directory, which the workspace
      // still requires for its remaining agents.
      const fixture = workspaceWithAgents("amp", ".agents/skills");
      expect(fixture.exists(`.agents/skills/${SKILL}`)).toBe(true);

      return Effect.gen(function* () {
        yield* removeAgent(fixture, "amp");

        expect(fixture.exists(`.agents/skills/${SKILL}`)).toBe(true);
        expect(fixture.readSettings()).toMatchObject({ agents: ["claude-code"] });
      });
    },
  );

  it.effect("retains Copilot's shared MCP key and foreign siblings when Claude Code leaves", () => {
    const fixture = makeAgentMembershipFixture({
      machine: true,
      settings: {
        owner: "@acme",
        agents: ["claude-code", "github-copilot-cli"],
        mcpServers: { api: { command: "node", args: ["api.js"], env: { TOKEN: "${TOKEN}" } } },
      },
      files: {
        ".mcp.json":
          '{"mcpServers":{"foreign":{"command":"keep-me","args":["foreign.js"]}},"foreignSetting":{"preserve":true}}\n',
      },
    });
    cleanups.push(fixture.cleanup);
    const decodeResult = () =>
      Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
        fixture.rendererState.results.at(-1)?.data,
      );
    return Effect.gen(function* () {
      yield* fixture.provide(handleSync({ preview: false }));
      const first = yield* decodeResult();
      expect(first.result.outcome).toBe("applied");
      const shared = first.result.nativeLocations.filter(
        (unit) => unit.address.path === `${fixture.root}/.mcp.json`,
      );
      expect(shared).toHaveLength(1);
      expect(shared[0]).toMatchObject({
        address: { kind: "key-path", keys: ["mcpServers", "api"] },
        ownership: "owned",
        configuredConsumers: ["claude-code", "github-copilot-cli"],
      });
      const nativeBefore = fixture.readFile(".mcp.json");
      const decodedBefore: unknown = JSON.parse(nativeBefore);
      expect(decodedBefore).toMatchObject({
        mcpServers: {
          api: {
            command: "node",
            args: ["api.js"],
            env: { TOKEN: "${TOKEN}" },
            "x-axm": { v: 1, managed: true, ext: "@workspace/mcps/api", source: "inline" },
          },
          foreign: { command: "keep-me", args: ["foreign.js"] },
        },
        foreignSetting: { preserve: true },
      });
      const lockBefore = fixture.readLockfileText();
      const declarationBefore = fixture.readSettings()["mcpServers"];

      yield* removeAgent(fixture, "claude-code");
      const removed = yield* decodeResult();
      expect(removed.result.outcome).toBe("applied");
      expect(fixture.readSettings()["agents"]).toEqual(["github-copilot-cli"]);
      expect(fixture.readSettings()["mcpServers"]).toEqual(declarationBefore);
      expect(fixture.readFile(".mcp.json")).toBe(nativeBefore);
      expect(fixture.readLockfileText()).toBe(lockBefore);
      const retained = removed.result.nativeLocations.filter(
        (unit) => unit.address.path === `${fixture.root}/.mcp.json`,
      );
      expect(retained).toHaveLength(1);
      expect(retained[0]).toMatchObject({
        address: { kind: "key-path", keys: ["mcpServers", "api"] },
        ownership: "owned",
        state: "retained",
        configuredConsumers: ["github-copilot-cli"],
        reason: expect.stringContaining("Still required by configured consumers"),
      });
      expect(removed.result.nativeLocationCounts.changed).toBe(0);
      const inventory = yield* fixture.provide(
        Effect.flatMap(WorkspaceRecords, (records) =>
          records.getExtensionInventory("mcp-server", {}),
        ),
      );
      const current = inventory.items.find((item) => item.name === "api");
      expect(current?.agentOutcomes).toMatchObject([
        { agentId: "github-copilot-cli", outcome: "current" },
      ]);
      expect(current?.agentOutcomes).toHaveLength(1);

      const settled = fixture.snapshot();
      yield* fixture.provide(handleSync({ preview: false }));
      expect((yield* decodeResult()).result.outcome).toBe("no-op");
      expect(fixture.snapshot()).toEqual(settled);
    });
  });

  it.effect.each(["trae", "trae-cn"] as const)(
    "retains the literal shared vendor Skill and MCP locations after removing %s",
    (departing) => {
      const remaining = departing === "trae" ? "trae-cn" : "trae";
      const fixture = makeAgentMembershipFixture({
        machine: true,
        settings: {
          owner: "@acme",
          agents: [departing, remaining],
          skills: { [SKILL]: { source: "workspace", enabled: true } },
          mcpServers: { context: { command: "node", args: ["server.js"] } },
        },
        files: {
          [`skills/${SKILL}/skill.json`]: SKILL_MANIFEST,
          [`skills/${SKILL}/src/SKILL.md`]: SKILL_BODY,
          ".trae/mcp.json": '{"mcpServers":{"foreign":{"command":"keep-me"}}}\n',
        },
      });
      cleanups.push(fixture.cleanup);
      const decodeResult = () =>
        Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
          fixture.rendererState.results.at(-1)?.data,
        );
      return Effect.gen(function* () {
        yield* fixture.provide(handleSync({ preview: false }));
        const first = yield* decodeResult();
        expect(first.result.outcome).toBe("applied");
        for (const suffix of [`.trae/skills/${SKILL}`, ".trae/mcp.json"]) {
          const units = first.result.nativeLocations.filter((unit) =>
            unit.address.path.endsWith(suffix),
          );
          expect(units).toHaveLength(1);
          expect(units[0]?.configuredConsumers).toEqual(["trae", "trae-cn"]);
        }
        const nativeBefore = fixture.snapshotOf(".trae");
        const sourceBefore = fixture.snapshotOf("skills");
        const mcpBefore = fixture.readFile(".trae/mcp.json");
        expect(mcpBefore).toContain('"keep-me"');
        expect(fixture.readFile(`.trae/skills/${SKILL}/SKILL.md`)).toBe(SKILL_BODY);

        yield* removeAgent(fixture, departing);
        const removed = yield* decodeResult();
        expect(removed.result.outcome).toBe("applied");
        expect(fixture.readSettings()["agents"]).toEqual([remaining]);
        expect(fixture.snapshotOf(".trae")).toEqual(nativeBefore);
        expect(fixture.snapshotOf("skills")).toEqual(sourceBefore);
        expect(fixture.readFile(".trae/mcp.json")).toBe(mcpBefore);
        for (const suffix of [`.trae/skills/${SKILL}`, ".trae/mcp.json"]) {
          const retained = removed.result.nativeLocations.filter((unit) =>
            unit.address.path.endsWith(suffix),
          );
          expect(retained).toHaveLength(1);
          expect(retained[0]).toMatchObject({
            state: "retained",
            configuredConsumers: [remaining],
          });
        }
        expect(removed.result.nativeLocationCounts.changed).toBe(0);

        const settled = fixture.snapshot();
        yield* fixture.provide(handleSync({ preview: false }));
        expect(fixture.snapshot()).toEqual(settled);
        expect((yield* decodeResult()).result.outcome).toBe("no-op");
      });
    },
  );
});
