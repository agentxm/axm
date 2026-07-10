import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { SettingsSchema } from "@agentxm/client-core/unstable/settings";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";

import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleAdopt } from "./command.js";

describe("adopt command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-adopt-test-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({ owner: "@acme", agents: [] }),
    );
    fs.writeFileSync(
      path.join(tempDir, ".axm", "axm-lock.yaml"),
      "lockfileVersion: 1\nskills: {}\n",
    );
    const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");
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
        yield* handleAdopt({ fqn: "@acme/skills/review", yes: true, preview: false });

        const settings = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SettingsSchema))(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf8"),
        );
        expect(settings.skills?.["review"]).toEqual({
          source: "workspace:@acme/skills/review",
          enabled: true,
        });
        expect(fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8")).toContain(
          "type: workspace",
        );
      }),
    );
  });
});
