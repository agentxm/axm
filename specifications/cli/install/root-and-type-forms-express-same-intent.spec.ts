import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSkillsInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/root-and-type-forms-express-same-intent",
  title: "Root install and the type command express the same durable intent",
  statement:
    "When the same extension is installed through the root install command and through its type-specific install command, both forms shall produce identical workspace configuration, identical canonical content, and identical agent projections.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["model"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

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

      yield* handleInstall({
        source: Option.some(rootPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(rootWorkspace.layer));

      yield* handleSkillsInstall(
        { source: Option.some(typePackage), skills: [], all: true },
        { yes: true, force: false, preview: false },
      ).pipe(Effect.provide(typeWorkspace.layer));

      expect(rootWorkspace.readSettings()).toEqual(typeWorkspace.readSettings());
      expect(rootWorkspace.snapshotTree(".claude")).toEqual(typeWorkspace.snapshotTree(".claude"));
      expect(rootWorkspace.snapshotTree("agent_extensions")).toEqual(
        typeWorkspace.snapshotTree("agent_extensions"),
      );
    }),
  );
});
