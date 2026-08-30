import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import type { LocalSource } from "../../sources/index.js";
import { discoverConventionRefs } from "./convention-discovery.js";

const localSource = (pathValue: string): LocalSource => ({
  type: "local",
  path: pathValue,
});

const writeSkill = (dir: string, name: string) => {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "skill.json"),
    JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0" }),
  );
  fs.writeFileSync(
    path.join(dir, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "A useful skill"\n---\n\n# ${name}\n`,
  );
};

const writePortableSkill = (dir: string, name: string) => {
  fs.mkdirSync(path.join(dir, "references"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "A portable skill"\n---\n\n# ${name}\n`,
  );
  fs.writeFileSync(path.join(dir, "references", "guide.md"), "# Guide\n");
};

const writeKnowledge = (dir: string, name: string) => {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "knowledge.json"),
    JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name,
      version: "1.0.0",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
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

  it.effect("discovers a standards-conforming skill without rewriting its name", () =>
    Effect.gen(function* () {
      writeSkill(path.join(tempDir, "pretty-skill"), "pretty-skill");

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

  it.effect("matches targeted skill discovery by its standards-conforming name", () =>
    Effect.gen(function* () {
      writeSkill(path.join(tempDir, "pretty-skill"), "pretty-skill");

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

  it.effect("discovers a portable Agent Skill without fabricating package identity", () =>
    Effect.gen(function* () {
      const skillDir = path.join(tempDir, ".agents", "skills", "react-router");
      writePortableSkill(skillDir, "react-router");

      const refs = yield* discoverConventionRefs(localSource(tempDir), tempDir, {
        type: "skill",
        names: ["react-router"],
        owner: Option.none(),
        versionRange: Option.none(),
      }).pipe(Effect.provide(NodeServices.layer));

      expect(refs).toHaveLength(1);
      const ref = refs[0];
      expect(ref?.type).toBe("skill");
      if (ref?.type === "skill" && ref.refType === "local") {
        expect(ref.owner).toBeUndefined();
        expect(ref.portable).toBe(true);
        expect(ref.sourcePath).toBe(path.join(".agents", "skills", "react-router"));
        expect(ref.location).toContain(".agents/skills/react-router");
      }
    }),
  );

  it.effect("ignores skills whose names do not conform to Agent Skills", () =>
    Effect.gen(function* () {
      writeSkill(path.join(tempDir, "pretty-skill"), "Pretty Skill");

      const refs = yield* discoverConventionRefs(localSource(tempDir), tempDir, {
        type: "skill",
        names: [],
        owner: Option.none(),
        versionRange: Option.none(),
      }).pipe(Effect.provide(NodeServices.layer));

      expect(refs).toStrictEqual([]);
    }),
  );

  it.effect("discovers Knowledge packages by manifest identity", () =>
    Effect.gen(function* () {
      writeKnowledge(path.join(tempDir, "packages", "directory-alias"), "platform");

      const refs = yield* discoverConventionRefs(localSource(tempDir), tempDir, {
        type: "knowledge",
        names: ["platform"],
        owner: Option.some(decodeHandleSync("@acme")),
        versionRange: Option.none(),
      }).pipe(Effect.provide(NodeServices.layer));

      expect(refs).toHaveLength(1);
      const ref = refs[0];
      expect(ref?.type).toBe("knowledge");
      if (ref?.type === "knowledge" && ref.refType === "local") {
        expect(ref.knowledge.name).toBe("platform");
        expect(ref.location).toContain("directory-alias");
      }
    }),
  );
});
