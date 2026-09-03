import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { LockfileSchema, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/records-accepted-resolution",
  title: "Install records the accepted resolution in the lockfile",
  statement:
    "When a person installs an acquirable extension, the install command shall record the extension's accepted resolution, including its source and content identity, in the workspace lockfile.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/install/direct-intent-recorded-and-realized"],
  supersedes: ["cli/install/direct-intent-recorded-and-realized"],
  assumptions: [],
  openQuestions: [],
});

const decodeLockfile = Schema.decodeUnknownEffect(LockfileSchema);

describe("Install records the accepted resolution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("records the accepted resolution in the authoritative lockfile", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      expect(workspace.readLockfileText()).not.toContain("code-review");

      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const parsed: unknown = YAML.parse(workspace.readLockfileText());
      const lockfile = yield* decodeLockfile(parsed);
      expect(lockfile.skills["code-review"]).toMatchObject({
        type: "local",
        extensionType: "skill",
        workspaceName: "code-review",
        packageName: "code-review",
        contentIdentity: expect.any(String),
        treeIntegrity: expect.anything(),
      });
    }),
  );
});
