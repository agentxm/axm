import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { codingAgentForId } from "../agent-adapters/index.js";
import { captureCopiedDirectory, retireCopiedDirectory } from "../locations/index.js";
import { nativeArtifactLocationOutcomes, retiredNativeArtifactLocationOutcomes } from "./index.js";

export const specification = defineSpecification({
  requirement: "workspace/native-locations/reports-independent-policy-and-readers",
  title: "Native location observations distinguish policy and reader evidence",
  statement:
    "AXM shall report one physical ownership unit with all declared aliases, distinguish configured consumers from potential native readers and shared Skill policy, preserve actual mutation state across duplicate consumers, distinguish completed removal from bounded retirement that retains user contents, and keep native availability unverified without runtime evidence.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Native artifact location outcomes", () => {
  it.effect.each([false, true])("reports bounded retirement with foreign children: %s", (foreign) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-native-retired-" });
      const target = path.join(root, ".agents/skills/review");
      yield* fs.makeDirectory(target, { recursive: true });
      yield* fs.writeFileString(path.join(target, "SKILL.md"), "# Owned\n");
      yield* captureCopiedDirectory(target, path.join(root, "source"));
      if (foreign) yield* fs.writeFileString(path.join(target, "personal.txt"), "Keep\n");
      const previous = yield* nativeArtifactLocationOutcomes({
        workspaceRoot: root,
        scope: "project",
        sharedSkillPolicy: true,
        agents: [codingAgentForId("codex")],
        configuredAgentIds: new Set<string>(),
        targets: [{ path: target, kind: "skill", state: "unchanged" }],
      });
      yield* retireCopiedDirectory(target);
      const after = yield* retiredNativeArtifactLocationOutcomes(previous);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        state: foreign ? "retained" : "removed",
        ownership: foreign ? "unowned" : "absent",
        potentialReaders: ["codex"],
        configuredConsumers: [],
        policyReasons: ["workspace-shared-skills"],
      });
      expect(after[0]).not.toHaveProperty("proof");
      if (foreign)
        expect(yield* fs.readFileString(path.join(target, "personal.txt"))).toBe("Keep\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("groups shared aliases once and keeps policy independent of configured readers", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-native-outcomes-" });
      const source = path.join(root, "source/review");
      const shared = path.join(root, ".agents/skills");
      yield* fs.makeDirectory(source, { recursive: true });
      yield* fs.makeDirectory(shared, { recursive: true });
      yield* fs.makeDirectory(path.join(root, ".claude"));
      yield* fs.symlink(shared, path.join(root, ".claude/skills"));
      yield* fs.symlink(source, path.join(shared, "review"));
      const outcomes = yield* nativeArtifactLocationOutcomes({
        workspaceRoot: root,
        scope: "project",
        sharedSkillPolicy: true,
        agents: [
          codingAgentForId("claude-code"),
          codingAgentForId("opencode"),
          codingAgentForId("codex"),
        ],
        configuredAgentIds: new Set(["claude-code"]),
        targets: [
          { path: ".agents/skills/review", kind: "skill", state: "created", sourcePath: source },
          { path: ".claude/skills/review", kind: "skill", state: "unchanged", sourcePath: source },
        ],
      });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({
        address: { kind: "entry", path: path.join(shared, "review") },
        configuredConsumers: ["claude-code"],
        potentialReaders: ["claude-code", "codex", "opencode"],
        policyReasons: ["workspace-shared-skills"],
        ownership: "owned",
        state: "created",
        mechanism: "symlink",
      });
      expect(outcomes[0]?.aliases).toContain(path.join(root, ".claude/skills/review"));
      expect(outcomes[0]?.availability.every((entry) => entry.state === "unverified")).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
