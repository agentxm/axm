import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../errors.js";
import { snapshotContent } from "../demote/test-helpers.js";
import { applyUnpack, makePackWorld, seedAuthoredPackWorkspace, PACK } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/packs/unpack/refuses-incomplete-membership",
  title: "Unpack refuses missing packs and members without usable resolutions",
  statement:
    "When a requested pack is absent or its membership and accepted member identities cannot be established, AXM shall refuse unpacking without changing workspace declarations, installed content, or accepted resolutions.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const faults = [
  { fault: "missing-pack", category: "not_found" },
  { fault: "missing-member", category: "not_found" },
  { fault: "missing-resolution", category: "not_found" },
  { fault: "unreadable-pack", category: "validation" },
] as const;

describe("Unpack refusal", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(faults)("refuses $fault without partial promotion", ({ fault, category }) => {
    const world = makePackWorld(cleanups);
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* seedAuthoredPackWorkspace(world);
          const root = world.workspace.root;
          if (fault === "missing-member") {
            fs.rmSync(nodePath.join(root, "agent_extensions/agentxm/@acme/skills/review"), {
              recursive: true,
            });
          }
          if (fault === "missing-resolution") {
            fs.rmSync(nodePath.join(root, "axm-lock.yaml"));
          }
          if (fault === "unreadable-pack") {
            world.workspace.writeFile(`packs/${PACK}/pack.json`, "{ invalid");
          }
          const before = snapshotContent(root);

          const failure = yield* applyUnpack({
            name: fault === "missing-pack" ? "absent" : PACK,
          }).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
          if (failure instanceof ExtensionLifecycleFailed) {
            expect(failure.category).toBe(category);
          }
          expect(snapshotContent(root)).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
