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
import { makePackWorkspace } from "../test-support/pack-membership.js";
import { ChangePackMembership } from "./change-pack-membership.js";

export const specification = defineSpecification({
  requirement: "cli/packs/add/selects-members-without-ambiguity",
  title: "Pack add selects the requested members without confusing shared names",
  statement:
    "When adding dependencies to an authored pack, AXM shall resolve the configured pack by its local name or unique full identity, add only members selected by full identity or an unambiguous name or name pattern, and refuse ambiguous or unmatched selections without editing the pack.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Selection is decided by the membership use case over the workspace's own desired state; a real project directory shows both which dependencies the manifest gained and that a refused selection left every byte alone.",
  derivedFrom: [
    "packages/core/extension-authoring/src/packs/configured-pack-selector.ts",
    "packages/core/extension-authoring/src/packs/change-pack-membership.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** A workspace authoring one pack, one skill, and one rule that share a name. */
const preparedWorkspace = () =>
  makePackWorkspace({
    pack: "toolkit",
    members: [
      { type: "skill", name: "member", version: "1.2.3", source: "workspace" },
      { type: "rule", name: "member", version: "1.2.3", source: "workspace" },
    ],
  });

describe("Selecting pack dependencies", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const addToPack = (created: AuthoringWorkspace, pack: string, selector: string) =>
    Effect.gen(function* () {
      const candidate = yield* ChangePackMembership.prepare({ change: "add", pack, selector });
      if (candidate._tag === "NoChange") throw new Error("Expected a membership change");
      return yield* ChangePackMembership.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  const selections = [
    { pack: "toolkit", selector: "@acme/skills/member", members: ["@acme/skills/member"] },
    {
      pack: "@acme/packs/toolkit",
      selector: "@acme/rules/member",
      members: ["@acme/rules/member"],
    },
    {
      pack: "toolkit",
      selector: "mem*",
      members: ["@acme/rules/member", "@acme/skills/member"],
    },
  ] as const;

  for (const example of selections)
    it.effect(`selects ${example.selector} in ${example.pack}`, () =>
      Effect.gen(function* () {
        const { created, seed } = preparedWorkspace();
        cleanups.push(created.cleanup);
        yield* seed;
        const declarations = created.read("axm.json");

        const resolution = yield* addToPack(created, example.pack, example.selector);

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        const manifest: unknown = JSON.parse(created.read("packs/toolkit/pack.json") ?? "null");
        if (
          typeof manifest !== "object" ||
          manifest === null ||
          !("dependencies" in manifest) ||
          typeof manifest.dependencies !== "object" ||
          manifest.dependencies === null
        ) {
          throw new Error("Expected pack dependency declarations");
        }
        expect(Object.keys(manifest.dependencies).sort()).toEqual([...example.members].sort());
        expect(created.read("axm.json")).toBe(declarations);
      }),
    );

  const refusals = [
    { pack: "toolkit", selector: "member", tag: "PackMemberAmbiguous" },
    { pack: "toolkit", selector: "missing", tag: "PackMemberNotFound" },
    { pack: "@other/packs/toolkit", selector: "@acme/skills/member", tag: "PackNotConfigured" },
  ] as const;

  for (const example of refusals)
    it.effect(`refuses ${example.pack} ${example.selector}`, () =>
      Effect.gen(function* () {
        const { created, seed } = preparedWorkspace();
        cleanups.push(created.cleanup);
        yield* seed;
        const before = created.snapshot();

        const failure = yield* addToPack(created, example.pack, example.selector).pipe(Effect.flip);

        expect(failure).toMatchObject({ _tag: example.tag });
        expect(created.snapshot()).toEqual(before);
      }),
    );
});
