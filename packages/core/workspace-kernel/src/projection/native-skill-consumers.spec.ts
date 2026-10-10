import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { observeAgentOutputs } from "./index.js";
import { codingAgentRepositoryLayer } from "./testing.js";
import { resolveProjectWorkspaceLayout, SettingsSchema } from "../workspace-state/index.js";

export const specification = defineSpecification({
  requirement: "workspace/skills/retains-physical-consumers-with-exact-link-proof",
  title: "Skill retirement preserves remaining consumers and foreign leaf links",
  statement:
    "When reconciling native Skill entries, AXM shall group aliases by physical parent and leaf, retain enabled entries required by any remaining primary or additional-path consumer or shared-location policy, and recognize storage link ownership only from the immediate link to that Skill's canonical source without following a foreign leaf chain. Native directories without bounded copy receipts remain unowned even when SKILL.md contains an AXM marker.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-native-consumers-" });
  const settings = Schema.decodeUnknownSync(SettingsSchema)({
    owner: "@acme",
    agents: [],
    skills: { review: { source: "workspace", enabled: true } },
  });
  const layout = yield* resolveProjectWorkspaceLayout(decodeAbsolutePathSync(root), settings);
  const source = path.join(layout.authoredRoot("skill"), "review", "src");
  yield* fs.makeDirectory(source, { recursive: true });
  yield* fs.writeFileString(
    path.join(path.dirname(source), "skill.json"),
    JSON.stringify({
      owner: "@acme",
      type: "skill",
      name: "review",
      version: "1.0.0",
    }),
  );
  yield* fs.writeFileString(path.join(source, "SKILL.md"), "# Review\n");
  const args = {
    workspaceRoot: root,
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    scope: "project" as const,
    desiredAgentIds: new Set<string>(),
    expectedNames: {
      skill: new Set(["review"]),
      subagent: new Set<string>(),
      hook: new Set<string>(),
      "mcp-server": new Set<string>(),
    },
    expectedHooks: [],
    expectedRegions: { rule: [], knowledge: [] },
    declaredMcpNames: new Set<string>(),
    expectedSkillSources: { review: [source] },
    expectedSubagentFiles: {},
    authoredSkills: { layout, entries: settings.skills ?? {} },
  };
  return { fs, path, root, source, args };
});
const services = Layer.merge(NodeServices.layer, codingAgentRepositoryLayer([]));

describe("Native Skill consumers and ownership", () => {
  it.effect("preserves a direct link to another same-named package without accepted proof", () =>
    Effect.gen(function* () {
      const { fs, path, root, args } = yield* fixture;
      const foreignSource = path.join(
        root,
        "agent_extensions/registry.agentxm.ai/@foreign/skills/review/src",
      );
      const target = path.join(root, ".claude/skills/review");
      yield* fs.makeDirectory(foreignSource, { recursive: true });
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.symlink(foreignSource, target);
      const inventory = yield* observeAgentOutputs(args);
      expect(inventory.outputs.find((entry) => entry.path === target)).toMatchObject({
        ownership: "unowned",
      });
      expect(inventory.ownedResidue).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );
  it.effect("retains a primary location for a remaining additional-path reader", () =>
    Effect.gen(function* () {
      const { fs, path, root, source, args } = yield* fixture;
      const directory = path.join(root, ".claude/skills");
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.symlink(source, path.join(directory, "review"));
      const inventory = yield* observeAgentOutputs({
        ...args,
        desiredAgentIds: new Set(["opencode"]),
      });
      const output = inventory.outputs.find(
        (entry) => entry.path === path.join(directory, "review"),
      );
      expect(output).toMatchObject({ ownership: "owned", desired: true });
      expect(output?.claimantAgentIds).toContain("opencode");
      expect(inventory.ownedResidue).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("keeps the shared entry with no configured agents and folds its parent aliases", () =>
    Effect.gen(function* () {
      const { fs, path, root, source, args } = yield* fixture;
      const shared = path.join(root, ".agents/skills");
      yield* fs.makeDirectory(shared, { recursive: true });
      yield* fs.makeDirectory(path.join(root, ".claude"));
      yield* fs.symlink(shared, path.join(root, ".claude/skills"));
      yield* fs.symlink(source, path.join(shared, "review"));
      const inventory = yield* observeAgentOutputs(args);
      expect(inventory.outputs.filter((entry) => entry.extensionType === "skill")).toHaveLength(1);
      expect(inventory.outputs[0]).toMatchObject({ desired: true, ownership: "owned" });
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("keeps distinct leaf entries and preserves a foreign chain into the store", () =>
    Effect.gen(function* () {
      const { fs, path, root, source, args } = yield* fixture;
      for (const directory of [".claude/skills", ".cursor/skills"])
        yield* fs.makeDirectory(path.join(root, directory), { recursive: true });
      yield* fs.symlink(source, path.join(root, ".claude/skills/review"));
      yield* fs.symlink(
        path.join(root, ".claude/skills/review"),
        path.join(root, ".cursor/skills/review"),
      );
      const inventory = yield* observeAgentOutputs(args);
      expect(
        inventory.outputs.find((entry) => entry.path === path.join(root, ".claude/skills/review")),
      ).toMatchObject({ ownership: "owned" });
      expect(
        inventory.outputs.find((entry) => entry.path === path.join(root, ".cursor/skills/review")),
      ).toMatchObject({ ownership: "unowned" });
      expect(inventory.outputs.filter((entry) => entry.extensionType === "skill")).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("does not grant recursive ownership from a marker inside a user directory", () =>
    Effect.gen(function* () {
      const { fs, path, root, args } = yield* fixture;
      const directory = path.join(root, ".claude/skills/review");
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(
        path.join(directory, "SKILL.md"),
        "<!-- axm:file v=1 ext=@acme/skills/review src=skills/review/src -->\nReview\n",
      );
      yield* fs.writeFileString(path.join(directory, "personal.txt"), "User content\n");
      const inventory = yield* observeAgentOutputs(args);
      expect(inventory.outputs.find((entry) => entry.path === directory)).toMatchObject({
        ownership: "unowned",
      });
      expect(inventory.ownedResidue).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );
});
