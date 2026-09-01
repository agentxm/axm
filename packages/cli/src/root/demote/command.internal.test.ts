import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { SettingsSchema } from "@agentxm/workspace-state";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/extension-workspace";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";

import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleDemote } from "./command.js";

const writeSkill = (dir: string, content: string) => {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "skill.json"),
    JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
  );
  fs.writeFileSync(path.join(dir, "src", "SKILL.md"), content);
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: review\ndescription: Review code\n---\n\n${content}`,
  );
};

describe("demote command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-demote-test-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: "workspace" },
      }),
    );
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 6\nskills: {}\n");
    writeSkill(path.join(tempDir, "skills", "review"), "# Workspace review\n");
    writeSkill(path.join(tempDir, "replacement", "review"), "# Replacement review\n");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("requires confirmation before replacing workspace authority", () => {
    const context = makeWorkspaceHandlerTestContext({
      flags: { nonInteractive: false },
      prompt: { confirmResponses: [false] },
      wsOptions: { projectRoot: tempDir },
    });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, context.fullLayer);
    const foundation = Layer.mergeAll(context.fullLayer, sourceLayer, CodingAgentRepositoryLive);
    const provide = makeEffectProvide(Layer.provideMerge(SkillManagerLive, foundation));
    const { promptState } = context;
    return provide(
      Effect.gen(function* () {
        yield* handleDemote({
          fqn: "@acme/skills/review",
          source: path.join(tempDir, "replacement", "review"),
          yes: false,
          preview: false,
        });

        expect(promptState.confirmCalls).toEqual([{ kind: "resolve-plan" }]);
        const settings = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SettingsSchema))(
          fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"),
        );
        expect(settings.skills?.["review"]).toEqual({
          source: "workspace",
          enabled: true,
        });
      }),
    );
  });

  it.effect("replaces workspace authority only after explicit consent", () => {
    const context = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, context.fullLayer);
    const foundation = Layer.mergeAll(context.fullLayer, sourceLayer, CodingAgentRepositoryLive);
    const provide = makeEffectProvide(Layer.provideMerge(SkillManagerLive, foundation));
    const replacement = path.join(tempDir, "replacement", "review");

    return provide(
      Effect.gen(function* () {
        yield* handleDemote({
          fqn: "@acme/skills/review",
          source: replacement,
          yes: true,
          preview: false,
        });

        const settings = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SettingsSchema))(
          fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"),
        );
        expect(settings.skills?.["review"]).toEqual({
          source: "./replacement/review",
          enabled: true,
        });
        expect(fs.existsSync(path.join(tempDir, "skills", "review"))).toBe(false);
      }),
    );
  });
});
