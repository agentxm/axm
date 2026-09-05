import { getAppError } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handlePacksAdd, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import {
  authoringTypes,
  writeAuthoringPackage,
  readPackageJson,
} from "../../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/packs/add/selects-members-without-ambiguity",
  title: "Pack add selects the requested members without confusing shared names",
  statement:
    "When adding dependencies to an authored pack, AXM shall resolve the configured pack by its local name or unique full identity, add only members selected by full identity or an unambiguous name or name pattern, and refuse ambiguous or unmatched selections without editing the pack.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/packs/add.ts",
    "packages/cli/src/root/packs/configured-pack-selector.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selecting pack dependencies", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  const prepared = () => {
    const created = workspace({
      settings: {
        agents: [],
        skills: { member: "workspace" },
        rules: { member: "workspace" },
        packs: { toolkit: "workspace" },
      },
    });
    for (const type of ["skill", "rule", "pack"]) {
      const row = authoringTypes.find((candidate) => candidate.type === type);
      if (row === undefined) throw new Error("Required fixture type missing");
      writeAuthoringPackage(created.root, row, type === "pack" ? "toolkit" : "member", {
        parent: row.plural,
      });
    }
    return created;
  };
  for (const example of [
    {
      pack: "toolkit",
      extension: "@acme/skills/member",
      members: ["@acme/skills/member"],
    },
    {
      pack: "@acme/packs/toolkit",
      extension: "@acme/rules/member",
      members: ["@acme/rules/member"],
    },
    {
      pack: "toolkit",
      extension: "mem*",
      members: ["@acme/skills/member", "@acme/rules/member"],
    },
  ])
    it.effect(`selects ${example.extension} in ${example.pack}`, () =>
      Effect.gen(function* () {
        const created = prepared();
        const declarations = created.readFile("axm.json");
        yield* handlePacksAdd({
          pack: example.pack,
          extension: example.extension,
          preview: false,
        }).pipe(Effect.provide(created.layer));
        expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
          planName: "Add to pack",
        });
        const manifest = readPackageJson(created.root, "packs/toolkit/pack.json");
        if (
          typeof manifest !== "object" ||
          manifest === null ||
          !("dependencies" in manifest) ||
          typeof manifest.dependencies !== "object" ||
          manifest.dependencies === null
        )
          throw new Error("Expected pack dependency declarations");
        expect(Object.keys(manifest.dependencies).sort()).toEqual([...example.members].sort());
        expect(created.readFile("axm.json")).toBe(declarations);
      }),
    );
  for (const example of [
    { pack: "toolkit", extension: "member" },
    { pack: "toolkit", extension: "missing" },
    { pack: "@other/packs/toolkit", extension: "@acme/skills/member" },
  ])
    it.effect(`refuses ambiguous or absent selection ${example.pack} ${example.extension}`, () =>
      Effect.gen(function* () {
        const created = prepared();
        const before = snapshotWorkspaceContent(created.root);
        const result = yield* handlePacksAdd({ ...example, preview: false }).pipe(
          Effect.flip,
          Effect.provide(created.layer),
        );
        expect(getAppError(result).code).toBe(
          example.extension === "member" ? "validation" : "not_found",
        );
        expect(snapshotWorkspaceContent(created.root)).toEqual(before);
      }),
    );
});
