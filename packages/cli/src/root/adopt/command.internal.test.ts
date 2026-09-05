import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { SettingsSchema } from "@agentxm/workspace-state";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { SkillManagerLive } from "@agentxm/extension-lifecycle/live";
import { SourceHostProvidersLive } from "@agentxm/extension-sources/live";

import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleAdopt } from "./command.js";

describe("adopt command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-adopt-test-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ owner: "@acme", agents: [] }),
    );
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
    const skillDir = path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), "# Review\n");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("adopts an unmanaged canonical package as a workspace source", () => {
    const context = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, context.fullLayer);
    const foundation = Layer.mergeAll(context.fullLayer, sourceLayer, CodingAgentRepositoryLive);
    const provide = makeEffectProvide(Layer.provideMerge(SkillManagerLive, foundation));
    return provide(
      Effect.gen(function* () {
        yield* handleAdopt({ fqn: "@acme/skills/review", preview: false });

        const settings = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SettingsSchema))(
          fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"),
        );
        expect(settings.skills?.["review"]).toEqual({ source: "workspace", enabled: true });
        expect(fs.existsSync(path.join(tempDir, "skills", "review", "skill.json"))).toBe(true);
        expect(
          fs.existsSync(
            path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "review"),
          ),
        ).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf8")).not.toContain(
          "review:",
        );
      }),
    );
  });
});
