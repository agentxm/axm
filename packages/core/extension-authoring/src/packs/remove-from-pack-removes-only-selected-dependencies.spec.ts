import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { SPEC_REGISTRY_SOURCE } from "../test-support/accepted-resolutions.js";
import { makePackWorkspace } from "../test-support/pack-membership.js";
import { ChangePackMembership } from "./change-pack-membership.js";

export const specification = defineSpecification({
  requirement: "cli/packs/remove/removes-only-selected-dependencies",
  title: "Pack remove changes only the selected dependency declarations",
  statement:
    "When a person removes matching dependencies from a workspace-authored pack, AXM shall remove only those manifest entries while preserving installed member content and direct workspace declarations, and shall refuse an unmatched selector or an externally sourced pack without changing the manifest.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "The manifest edit and everything it must leave alone — acquired member content, settings, the lockfile — are all observable in a real project directory the membership use case writes through.",
  derivedFrom: [
    "packages/core/extension-authoring/src/packs/remove-from-pack.test.ts",
    "packages/core/extension-authoring/src/packs/change-pack-membership.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Removing dependencies from an authored pack", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const membership = (created: AuthoringWorkspace, change: "add" | "remove", selector: string) =>
    Effect.gen(function* () {
      const candidate = yield* ChangePackMembership.prepare({
        change,
        pack: "toolkit",
        selector,
      });
      if (candidate._tag === "NoChange") throw new Error("Expected a membership change");
      return yield* ChangePackMembership.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  /** A pack recording two acquired Registry skills. */
  const packWithTwoMembers = () =>
    Effect.gen(function* () {
      const { created, seed } = makePackWorkspace({
        agents: ["claude-code"],
        pack: "toolkit",
        members: [
          { type: "skill", name: "review", version: "1.2.3", source: "registry" },
          { type: "skill", name: "test-helper", version: "1.2.3", source: "registry" },
        ],
      });
      cleanups.push(created.cleanup);
      yield* seed;
      for (const name of ["review", "test-helper"]) {
        yield* membership(created, "add", `@acme/skills/${name}`);
      }
      return created;
    });

  for (const selector of ["@acme/skills/review", "@acme/skills/*"])
    it.effect(`removes the entries matching ${selector}`, () =>
      Effect.gen(function* () {
        const created = yield* packWithTwoMembers();
        const acquiredBefore = created.snapshot("agent_extensions");
        const settingsBefore = created.read("axm.json");
        const lockBefore = created.lockfileText();

        const resolution = yield* membership(created, "remove", selector);

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        const manifest: unknown = JSON.parse(created.read("packs/toolkit/pack.json") ?? "null");
        expect(manifest).toEqual(
          expect.objectContaining({
            dependencies: selector.endsWith("*") ? {} : { "@acme/skills/test-helper": ">=1.2.3" },
          }),
        );
        expect(JSON.stringify(manifest)).not.toContain('"@acme/skills/review"');
        expect(created.snapshot("agent_extensions")).toEqual(acquiredBefore);
        expect(created.read("axm.json")).toBe(settingsBefore);
        expect(created.lockfileText()).toBe(lockBefore);
      }),
    );

  const refusals = [
    { fault: "unmatched", selector: "@acme/skills/missing", tag: "PackMemberNotDeclared" },
    { fault: "external-pack", selector: "@acme/skills/review", tag: "PackNotAuthored" },
  ] as const;

  for (const row of refusals)
    it.effect(`refuses ${row.fault} without changing content`, () =>
      Effect.gen(function* () {
        const created = yield* packWithTwoMembers();
        if (row.fault === "external-pack") {
          created.writeSettings({
            owner: "@acme",
            agents: ["claude-code"],
            sources: [SPEC_REGISTRY_SOURCE],
            skills: {
              review: "@acme/skills/review",
              "test-helper": "@acme/skills/test-helper",
            },
            packs: { toolkit: "@acme/packs/toolkit" },
          });
        }
        const before = created.snapshot();

        const failure = yield* membership(created, "remove", row.selector).pipe(Effect.flip);

        expect(failure).toMatchObject({ _tag: row.tag });
        expect(created.snapshot()).toEqual(before);
      }),
    );
});
