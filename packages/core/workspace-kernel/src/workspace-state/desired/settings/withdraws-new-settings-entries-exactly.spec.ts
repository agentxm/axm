import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { SettingsSchema, writeSettingsAtPath } from "../../index.js";
import { WorkspaceFileWriteLocks } from "../../../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../../../settlement/live.js";

export const specification = defineSpecification({
  requirement: "settings-contract/withdraws-new-settings-entries-exactly",
  title: "Withdrawing newly introduced settings intent restores its exact baseline",
  statement:
    "When precisely a newly introduced settings declaration is withdrawn without intervening intent or file-identity changes, AXM shall restore the prior bytes and preserve preexisting empty maps. Explicit adoption and activation shall not establish this restoration authority; stale or missing proof shall never remove unrelated content.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Atomic file publication and independent receipt reads expose original bytes and container identities.",
  methods: ["example", "decision-table"],
  derivedFrom: ["settings-contract/saving-settings-preserves-authored-formatting"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const platform = WorkspaceFileWriteLocksLive.pipe(Layer.provideMerge(NodeServices.layer));
const settings = Schema.decodeUnknownEffect(Schema.fromJsonString(SettingsSchema));

describe("settings intent round trips", () => {
  for (const before of [
    "{}",
    '{"skills":{}}',
    '{\r\n  "agents": [],\r\n  "skills": {}\r\n}',
    '{"futureSetting":{"keep":true}}\n\n',
  ]) {
    it.effect(`restores ${JSON.stringify(before)} after withdrawing one new declaration`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const settingsPath = path.join(root, "axm.json");
        const runtimeDir = path.join(root, ".axm");
        yield* fs.makeDirectory(runtimeDir);
        yield* fs.writeFileString(settingsPath, before);
        const original = yield* settings(before);
        const context = {
          nativeRoot: root,
          runtimeDir,
          eligible: true,
          locks: yield* WorkspaceFileWriteLocks,
        };
        yield* writeSettingsAtPath(
          settingsPath,
          { ...original, skills: { review: { source: "workspace", enabled: true } } },
          context,
        );
        expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(true);
        yield* writeSettingsAtPath(settingsPath, { ...original, skills: {} }, context);
        expect(yield* fs.readFileString(settingsPath)).toBe(before);
        expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect("does not create adoption proof or reuse proof after a foreign file replacement", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const settingsPath = path.join(root, "axm.json");
      const runtimeDir = path.join(root, ".axm");
      yield* fs.makeDirectory(runtimeDir);
      yield* fs.writeFileString(settingsPath, "{}");
      const context = {
        nativeRoot: root,
        runtimeDir,
        eligible: false,
        locks: yield* WorkspaceFileWriteLocks,
      };
      yield* writeSettingsAtPath(
        settingsPath,
        { skills: { review: { source: "workspace", enabled: true } } },
        context,
      );
      expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
      yield* writeSettingsAtPath(settingsPath, { skills: {} }, context);
      yield* writeSettingsAtPath(
        settingsPath,
        { skills: { review: { source: "workspace", enabled: true } } },
        { ...context, eligible: true },
      );
      const bytes = yield* fs.readFileString(settingsPath);
      yield* fs.writeFileString(path.join(root, "replacement"), bytes);
      yield* fs.rename(path.join(root, "replacement"), settingsPath);
      yield* writeSettingsAtPath(settingsPath, { skills: {} }, context);
      expect(JSON.parse(yield* fs.readFileString(settingsPath))).toEqual({ skills: {} });
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const before of ["{}", '{"agents":[]}', '{\r\n  "agents": ["claude-code"]\r\n}']) {
    it.effect(`restores ${JSON.stringify(before)} after withdrawing one new agent route`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const settingsPath = path.join(root, "axm.json");
        const runtimeDir = path.join(root, ".axm");
        yield* fs.makeDirectory(runtimeDir);
        yield* fs.writeFileString(settingsPath, before);
        const original = yield* settings(before);
        const context = {
          nativeRoot: root,
          runtimeDir,
          eligible: true,
          locks: yield* WorkspaceFileWriteLocks,
        };
        yield* writeSettingsAtPath(
          settingsPath,
          { ...original, agents: [...(original.agents ?? []), "codex"] },
          context,
        );
        yield* writeSettingsAtPath(
          settingsPath,
          { ...original, agents: original.agents ?? [] },
          context,
        );
        expect(yield* fs.readFileString(settingsPath)).toBe(before);
        expect(yield* fs.exists(path.join(runtimeDir, "projection-containers.json"))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }
});
