import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { LocalSource } from "../../sources/index.js";
import { discoverConventionRefs } from "./convention-discovery.js";

const localSource = (pathValue: string): LocalSource => ({
  type: "local",
  path: pathValue,
});

const writeSkill = (dir: string, name: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "A useful skill"\n---\n\n# ${name}\n`,
  );
};

describe("discoverConventionRefs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "convention-discovery-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("normalizes human-authored skill names into AXM extension names", () =>
    Effect.gen(function* () {
      writeSkill(path.join(tempDir, "skills", "pretty"), "Pretty Skill");

      const refs = yield* discoverConventionRefs(localSource(tempDir), tempDir, {
        type: "skill",
        names: [],
        owner: Option.none(),
        versionRange: Option.none(),
      }).pipe(Effect.provide(NodeServices.layer));

      expect(refs).toHaveLength(1);
      const ref = refs[0];
      expect(ref?.type).toBe("skill");
      if (ref?.type === "skill") {
        expect(ref.skill.name).toBe("pretty-skill");
      }
    }),
  );

  it.effect("matches targeted skill discovery by normalized name", () =>
    Effect.gen(function* () {
      writeSkill(path.join(tempDir, "skills", "pretty"), "Pretty Skill");

      const refs = yield* discoverConventionRefs(localSource(tempDir), tempDir, {
        type: "skill",
        names: ["pretty-skill"],
        owner: Option.none(),
        versionRange: Option.none(),
      }).pipe(Effect.provide(NodeServices.layer));

      expect(refs).toHaveLength(1);
      const ref = refs[0];
      expect(ref?.type).toBe("skill");
      if (ref?.type === "skill") {
        expect(ref.skill.name).toBe("pretty-skill");
      }
    }),
  );

  it.effect("rejects skills whose names normalize to the same identity", () =>
    Effect.gen(function* () {
      writeSkill(path.join(tempDir, "skills", "pretty-a"), "Pretty Skill");
      writeSkill(path.join(tempDir, "skills", "pretty-b"), "pretty-skill");

      const error = yield* discoverConventionRefs(localSource(tempDir), tempDir, {
        type: "skill",
        names: [],
        owner: Option.none(),
        versionRange: Option.none(),
      }).pipe(Effect.flip, Effect.provide(NodeServices.layer));

      expect(error.code).toBe("validation");
      expect(error.detail).toContain("skill:pretty-skill");
    }),
  );
});
