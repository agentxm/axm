import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSkillsInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/install-forms-express-same-intent",
  title: "Root install and the type command express the same durable intent",
  statement:
    "When the same extension is installed, and then reinstalled at the same constraint, through the root install command and through its type-specific install command, both forms shall produce identical workspace configuration, identical canonical content, identical agent projections, and the same reported outcome.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["model"],
  derivedFrom: ["cli/install/reinstall-is-idempotent"],
  supersedes: ["cli/install/root-and-type-forms-express-same-intent"],
  assumptions: [],
  openQuestions: [],
});

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const rootInstall = (workspace: SpecWorkspace, skillPackage: string) =>
  handleInstall({
    source: Option.some(skillPackage),
    force: false,
    preview: false,
  }).pipe(Effect.provide(workspace.layer));

const typeInstall = (workspace: SpecWorkspace, skillPackage: string) =>
  handleSkillsInstall(
    { source: Option.some(skillPackage), skills: [], all: true },
    { force: false, preview: false },
  ).pipe(Effect.provide(workspace.layer));

const expectSameRealizedState = (rootWorkspace: SpecWorkspace, typeWorkspace: SpecWorkspace) => {
  expect(rootWorkspace.readSettings()).toEqual(typeWorkspace.readSettings());
  for (const relative of [".claude", ".agents", "agent_extensions"]) {
    expect(snapshotWorkspaceContent(`${rootWorkspace.root}/${relative}`)).toEqual(
      snapshotWorkspaceContent(`${typeWorkspace.root}/${relative}`),
    );
  }
};

describe("Root and type-specific install parity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("both forms produce the same configuration, resolution, and realized state", () =>
    Effect.gen(function* () {
      const rootWorkspace = makeSpecWorkspace();
      const typeWorkspace = makeSpecWorkspace();
      cleanups.push(rootWorkspace.cleanup, typeWorkspace.cleanup);

      const rootPackage = writeLocalSkillPackage(rootWorkspace.root, { name: "code-review" });
      const typePackage = writeLocalSkillPackage(typeWorkspace.root, { name: "code-review" });

      yield* rootInstall(rootWorkspace, rootPackage);
      yield* typeInstall(typeWorkspace, typePackage);

      expectSameRealizedState(rootWorkspace, typeWorkspace);
    }),
  );

  it.effect("repeating the install through either form reports the same no-op and state", () =>
    Effect.gen(function* () {
      const rootWorkspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      const typeWorkspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(rootWorkspace.cleanup, typeWorkspace.cleanup);

      const rootPackage = writeLocalSkillPackage(rootWorkspace.root, { name: "code-review" });
      const typePackage = writeLocalSkillPackage(typeWorkspace.root, { name: "code-review" });

      yield* rootInstall(rootWorkspace, rootPackage);
      yield* typeInstall(typeWorkspace, typePackage);
      yield* rootInstall(rootWorkspace, rootPackage);
      yield* typeInstall(typeWorkspace, typePackage);

      const rootRepeat = rootWorkspace.rendererState.results.at(-1)?.data;
      const typeRepeat = typeWorkspace.rendererState.results.at(-1)?.data;
      expect(rootRepeat).toMatchObject({ result: { outcome: "no-op" } });
      expect(typeRepeat).toMatchObject({ result: { outcome: "no-op" } });

      expectSameRealizedState(rootWorkspace, typeWorkspace);
    }),
  );
});
