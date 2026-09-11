/**
 * Driving the unpack use case, and the workspaces its examples run over.
 *
 * Unpacking is a graph transition over state a Pack already established, so
 * the fixtures here build that state the way the product does: real members
 * acquired from a `file://` Registry, and a Pack recorded over them — either
 * the Registry Pack that brought them in, or an authored Pack manifest the
 * workspace owns.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";

import { previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";

import { applyInstall, installRequest } from "../install/test-helpers.js";
import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  type LifecycleFixture,
  type LifecycleRegistry,
} from "../testing.js";
import { PromoteAuthoredPack, type PromoteAuthoredPackRequest } from "./promote-authored-pack.js";

export const PACK = "toolkit";
export const MEMBERS = ["review", "test-helper"] as const;
export const MEMBER_VERSION = "1.2.3";

/** Settle an unpack and preview it: nothing is written. */
export const previewUnpack = (request: PromoteAuthoredPackRequest) =>
  Effect.gen(function* () {
    const candidate = yield* PromoteAuthoredPack.prepare(request);
    return yield* PromoteAuthoredPack.previewOrApply(candidate, previewPlanExecution);
  });

/** Settle an unpack and apply it. */
export const applyUnpack = (request: PromoteAuthoredPackRequest) =>
  Effect.gen(function* () {
    const candidate = yield* PromoteAuthoredPack.prepare(request);
    return yield* PromoteAuthoredPack.previewOrApply(candidate, preapprovedPlanExecution);
  });

export interface PackWorld {
  readonly workspace: LifecycleFixture;
  readonly registry: LifecycleRegistry;
}

/** A workspace with a `file://` Registry declared as its only source. */
export const makePackWorld = (
  cleanups: Array<() => void>,
  settings: Readonly<Record<string, unknown>> = {},
): PackWorld => {
  const registry = makeLifecycleRegistry();
  cleanups.push(registry.cleanup);
  const workspace = makeLifecycleFixture({
    sources: "live",
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      sources: [registry.source],
      ...settings,
    },
  });
  cleanups.push(workspace.cleanup);
  return { workspace, registry };
};

/**
 * An authored Pack manifest recording the named members as dependencies —
 * the shape `axm packs new` plus `axm packs add` leaves behind.
 */
export const writeAuthoredPack = (
  root: string,
  name: string,
  members: ReadonlyArray<string>,
): string => {
  const packageRoot = nodePath.join(root, "packs", name);
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    nodePath.join(packageRoot, "pack.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/pack.schema.json",
        owner: "@acme",
        type: "pack",
        name,
        version: "1.0.0",
        description: `The ${name} pack.`,
        dependencies: Object.fromEntries(
          members.map((member) => [`@acme/skills/${member}`, `>=${MEMBER_VERSION}`]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  return packageRoot;
};

/**
 * Two accepted member skills and an authored Pack that records both, with the
 * members' own direct declarations withdrawn so the Pack owns them. An
 * `extraSettings` override adds back a direct declaration a person wrote.
 */
export const seedAuthoredPackWorkspace = (
  world: PackWorld,
  extraSettings: Readonly<Record<string, unknown>> = {},
) =>
  Effect.gen(function* () {
    for (const member of MEMBERS) {
      world.registry.writeSkill(member, [
        { version: MEMBER_VERSION, body: `Instructions for ${member}.` },
      ]);
    }
    for (const member of MEMBERS) {
      yield* applyInstall(
        installRequest({ subject: { kind: "source", source: `@acme/skills/${member}` } }),
      );
    }
    writeAuthoredPack(world.workspace.root, PACK, MEMBERS);
    world.workspace.writeFile(
      "axm.json",
      `${JSON.stringify(
        {
          owner: "@acme",
          agents: ["claude-code"],
          sources: [world.registry.source],
          packs: { [PACK]: "workspace" },
          ...extraSettings,
        },
        null,
        2,
      )}\n`,
    );
  });
