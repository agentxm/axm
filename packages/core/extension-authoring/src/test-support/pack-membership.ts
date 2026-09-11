/**
 * A workspace that authors one pack and holds the members it can depend on.
 *
 * Pack membership is decided over the workspace's desired-state graph, so the
 * fixture builds the real inputs that graph reads: a settings declaration, the
 * canonical package on disk, and — for an acquired member — the accepted
 * Registry resolution that fixes its version. The pack itself is created
 * through the product's own creation use case rather than written by hand.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CreateExtension } from "../create/create-extension.js";
import { authoringTypeFor, writeAuthoringPackage } from "./authoring-packages.js";
import { SPEC_REGISTRY_SOURCE, seedAcceptedRegistryResolution } from "./accepted-resolutions.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "./authoring-workspace.js";

/** One member the workspace holds, and how it holds it. */
export interface PackMemberFixture {
  readonly type: "skill" | "rule";
  readonly name: string;
  readonly version: string;
  /** `registry` members carry an accepted resolution; `workspace` members are authored. */
  readonly source: "registry" | "workspace";
}

export interface PackWorkspaceOptions {
  readonly members: ReadonlyArray<PackMemberFixture>;
  /** The pack the workspace authors. Omit to create no pack. */
  readonly pack?: string;
  readonly agents?: ReadonlyArray<string>;
}

const settingsEntry = (member: PackMemberFixture): string =>
  member.source === "workspace"
    ? "workspace"
    : `@acme/${member.type === "skill" ? "skills" : "rules"}/${member.name}`;

const settingsKey = (member: PackMemberFixture): "skills" | "rules" =>
  member.type === "skill" ? "skills" : "rules";

/**
 * Build the workspace and return it with the effect that seeds its accepted
 * resolutions and creates the authored pack.
 */
export const makePackWorkspace = (options: PackWorkspaceOptions) => {
  const created = makeAuthoringWorkspace({ owner: "@acme", agents: options.agents ?? [] });
  const declarations: Record<string, Record<string, string>> = {};
  for (const member of options.members) {
    const key = settingsKey(member);
    declarations[key] = { ...declarations[key], [member.name]: settingsEntry(member) };
  }
  created.writeSettings({
    owner: "@acme",
    agents: options.agents ?? [],
    sources: [SPEC_REGISTRY_SOURCE],
    ...declarations,
  });
  for (const member of options.members) {
    const row = authoringTypeFor(member.type);
    writeAuthoringPackage(created.root, row, member.name, {
      version: member.version,
      parent:
        member.source === "workspace" ? row.plural : `agent_extensions/agentxm/@acme/${row.plural}`,
    });
  }

  const seed = Effect.gen(function* () {
    for (const member of options.members) {
      if (member.source !== "registry") continue;
      // Only skills carry an accepted Registry resolution in these fixtures;
      // an authored member's version comes from its own manifest.
      yield* seedAcceptedRegistryResolution({
        type: "skill",
        owner: "@acme",
        name: member.name,
        version: member.version,
      });
    }
    if (options.pack === undefined) return;
    const candidate = yield* CreateExtension.prepare({
      type: "pack",
      name: options.pack,
      owner: Option.none(),
    });
    yield* CreateExtension.previewOrApply(candidate, applyExecution);
  }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  return { created, seed };
};
