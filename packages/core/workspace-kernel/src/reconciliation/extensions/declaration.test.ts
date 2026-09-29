import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { RegistrySkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";

import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../../settlement/testing.js";
import { makeRegistrySkillLockEntry } from "../../workspace-state/testing.js";
import { exactVersion, extensionName, handle, recipeWorkspace } from "../test-helpers.js";
import { declareMaterialization } from "./declaration.js";

const SKILL = "review";
const FQN = `@acme/skills/${SKILL}`;

/** Two configured Registries; a bare locator binds to `primary`. */
const primary = { name: "primary", location: "https://primary.example.com/" };
const mirror = { name: "mirror", location: "https://mirror.example.com/" };

let root: string;

beforeEach(() => {
  root = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-declare-")));
});

afterEach(() => {
  nodeFs.rmSync(root, { recursive: true, force: true });
});

const writeSettings = (declared: string) =>
  nodeFs.writeFileSync(
    nodePath.join(root, "axm.json"),
    JSON.stringify({
      owner: "@acme",
      agents: [],
      defaultRegistry: primary.name,
      sources: [primary, mirror].map((source) => ({ ...source, type: "registry" })),
      skills: { [SKILL]: declared },
    }),
  );

const declaredSource = (): unknown => {
  const settings: unknown = JSON.parse(
    nodeFs.readFileSync(nodePath.join(root, "axm.json"), "utf8"),
  );
  if (typeof settings !== "object" || settings === null || !("skills" in settings))
    return undefined;
  const skills = settings.skills;
  if (typeof skills !== "object" || skills === null) return undefined;
  const entry: unknown = Reflect.get(skills, SKILL);
  return typeof entry === "object" && entry !== null && "source" in entry ? entry.source : entry;
};

/** Declare the skill resolved from `primary` with the durable range `range`. */
const declareFromPrimary = (range: string) => {
  const ref: RegistrySkillRef = {
    type: "skill",
    refType: "registry",
    publisherBindingId: "hbnd_test",
    source: {
      type: "registry",
      name: primary.name,
      location: new URL(primary.location),
      owner: Option.some(handle("@acme")),
    },
    owner: handle("@acme"),
    name: extensionName(SKILL),
    version: exactVersion("1.1.0"),
    integrity: Option.none(),
    packages: [],
    skill: { name: extensionName(SKILL), description: Option.none(), metadata: Option.none() },
  };
  return declareMaterialization({
    ref,
    name: extensionName(SKILL),
    versionRange: Option.some(range),
    resolution: Option.some({
      key: SKILL,
      entry: makeRegistrySkillLockEntry({
        owner: handle("@acme"),
        name: SKILL,
        endpoint: new URL(primary.location),
      }),
    }),
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        recipeWorkspace(root),
        Layer.mergeAll(
          WorkspaceFileWriteLocksLive,
          WorkspaceTransactionScopeTest({
            workspaceDir: root,
            settingsPath: nodePath.join(root, "axm.json"),
            lockPath: nodePath.join(root, "axm-lock.yaml"),
          }),
        ).pipe(Layer.provideMerge(NodeServices.layer)),
      ),
    ),
  );
};

describe("declareMaterialization", () => {
  it.effect("keeps a bare declaration bare and replaces only its range", () =>
    Effect.gen(function* () {
      writeSettings(`${FQN}@1.0.0`);
      yield* declareFromPrimary("^1.1.0");
      expect(declaredSource()).toBe(`${FQN}@^1.1.0`);
    }),
  );

  it.effect("keeps a qualified declaration qualified and replaces only its range", () =>
    Effect.gen(function* () {
      writeSettings(`${primary.name}:${FQN}@1.0.0`);
      yield* declareFromPrimary("^1.1.0");
      expect(declaredSource()).toBe(`${primary.name}:${FQN}@^1.1.0`);
    }),
  );

  it.effect("rewrites a declaration bound to a different Registry as the resolved binding", () =>
    Effect.gen(function* () {
      writeSettings(`${mirror.name}:${FQN}@1.0.0`);
      yield* declareFromPrimary("^1.1.0");
      expect(declaredSource()).toBe(`${primary.name}:${FQN}@^1.1.0`);
    }),
  );
});
