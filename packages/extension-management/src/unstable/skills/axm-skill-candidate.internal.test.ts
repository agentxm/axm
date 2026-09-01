import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { computeSourceHash } from "../workspace/rendered-files.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "./axm-skill-compatibility.js";
import { validateAxmSkillCandidate } from "./axm-skill-candidate.js";
import type { WorkspaceSkillRef } from "../workspace/refs/skill.js";

const VERSION = "1.2.3";

describe("validateAxmSkillCandidate", () => {
  let packageRoot: string;

  beforeEach(() => {
    packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-skill-candidate-"));
    fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  });

  const ref = (owner = "@agentxm", name = "axm"): WorkspaceSkillRef => {
    const decodedName = extensionName(name);
    const decodedOwner = handle(owner);
    return {
      type: "skill",
      refType: "workspace",
      source: {
        type: "workspace",
        owner: decodedOwner,
        extensionType: "skill",
        name: decodedName,
      },
      owner: decodedOwner,
      name: decodedName,
      version: exactVersion(VERSION),
      scope: "project",
      location: packageRoot,
      sourceHash: computeSourceHash("candidate"),
      skill: { name: decodedName, description: Option.none(), metadata: Option.none() },
    };
  };

  const writeCandidate = (range: string) => {
    fs.writeFileSync(
      path.join(packageRoot, "skill.json"),
      JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: VERSION }),
    );
    fs.writeFileSync(
      path.join(packageRoot, "src", "SKILL.md"),
      `---\nname: axm\ndescription: AXM guidance\nmetadata:\n  axm.sh/cli-version: ${VERSION}\n  axm.sh/cli-version-range: "${range}"\n---\n`,
    );
  };

  const run = (candidateRef: WorkspaceSkillRef) =>
    validateAxmSkillCandidate({
      ref: candidateRef,
      packageRoot,
      skillSourcePath: path.join(packageRoot, "src"),
    }).pipe(
      Effect.provide(
        Layer.mergeAll(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer(VERSION)),
      ),
    );

  it.effect("accepts compatible official bytes", () => {
    writeCandidate(VERSION);
    return Effect.gen(function* () {
      const result = yield* run(ref());
      expect(result?.status).toBe("compatible");
    });
  });

  it.effect("rejects incompatible official bytes before persistence", () => {
    writeCandidate(">=2.0.0 <3.0.0");
    return Effect.gen(function* () {
      const error = yield* Effect.flip(run(ref()));
      expect(error.code).toBe("conflict");
      expect(error.detail).toContain("outside its declared CLI range");
    });
  });

  it.effect("leaves unrelated skills unchanged", () => {
    fs.writeFileSync(
      path.join(packageRoot, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "axm", version: VERSION }),
    );
    return Effect.gen(function* () {
      expect(yield* run(ref("@acme"))).toBeNull();
    });
  });
});
