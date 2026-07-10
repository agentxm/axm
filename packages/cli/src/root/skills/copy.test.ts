import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { SettingsSchema } from "@agentxm/client-core/unstable/settings";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleCopySkill } from "./copy.js";

describe("skills copy", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-copy-skill-test-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({ owner: "@acme", agents: [] }),
    );
    fs.writeFileSync(
      path.join(tempDir, ".axm", "axm-lock.yaml"),
      "lockfileVersion: 1\nskills: {}\n",
    );
    const sourceDir = path.join(tempDir, "source", "review");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("copies a local skill into workspace authorship", () => {
    const context = makeWorkspaceHandlerTestContext({
      wsOptions: { projectRoot: tempDir },
    });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, context.fullLayer);
    const foundation = Layer.mergeAll(context.fullLayer, sourceLayer, CodingAgentRepositoryLive);
    const provide = makeEffectProvide(Layer.provideMerge(SkillManagerLive, foundation));

    return provide(
      Effect.gen(function* () {
        yield* handleCopySkill({
          source: path.join(tempDir, "source", "review"),
          target: "@acme/skills/copied-review",
          from: Option.none(),
          yes: true,
          force: false,
          preview: false,
        });

        const targetDir = path.join(
          tempDir,
          ".axm",
          "extensions",
          "@acme",
          "skills",
          "copied-review",
        );
        expect(fs.existsSync(path.join(targetDir, "skill.json"))).toBe(true);
        expect(fs.existsSync(path.join(targetDir, "src", "SKILL.md"))).toBe(true);
        const settings = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SettingsSchema))(
          fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf8"),
        );
        expect(settings.skills?.["copied-review"]).toEqual({
          source: "workspace:@acme/skills/copied-review",
          enabled: true,
        });
        expect(fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf8")).toContain(
          "type: workspace",
        );
      }),
    );
  });
});
