import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { ChangeAuthoredVersion, type AuthoredVersionChange } from "./change-authored-version.js";

export const specification = defineSpecification({
  requirement: "cli/version/refuses-invalid-or-unowned-targets",
  title: "Version refuses invalid versions and packages outside workspace authorship",
  statement:
    "When a version request has an invalid target identity or version, or does not identify a matching workspace-authored package, AXM shall refuse it without changing package content or workspace declarations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Every one of these refusals is settled by the version use case before its transaction opens, so a real project workspace shows the typed refusal and a byte-identical tree.",
  derivedFrom: ["apps/cli/src/root/version/command.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Each fault, what the workspace declares, and the refusal it settles with. */
const faults = [
  {
    fault: "external-source",
    configured: "./vendor/review",
    handle: "@acme/skills/review",
    change: { _tag: "Increment", rule: "patch" },
    tag: "VersionTargetNotAuthored",
  },
  {
    fault: "unconfigured",
    configured: undefined,
    handle: "@acme/skills/review",
    change: { _tag: "Increment", rule: "patch" },
    tag: "VersionTargetNotAuthored",
  },
  {
    fault: "wrong-owner",
    configured: "workspace",
    handle: "@other/skills/review",
    change: { _tag: "Increment", rule: "patch" },
    tag: "VersionTargetIdentityMismatch",
  },
  {
    fault: "invalid-identity",
    configured: "workspace",
    handle: "not-an-identity",
    change: { _tag: "Increment", rule: "patch" },
    tag: "FqnInvalidError",
  },
  {
    fault: "version-range",
    configured: "workspace",
    handle: "@acme/skills/review",
    change: { _tag: "Exact", version: "^2.0.0" },
    tag: "VersionTargetInvalid",
  },
] as const satisfies ReadonlyArray<{
  readonly fault: string;
  readonly configured: string | undefined;
  readonly handle: string;
  readonly change: AuthoredVersionChange;
  readonly tag: string;
}>;

describe("Version refusal", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of faults)
    it.effect(`refuses ${row.fault}`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);
        created.writeSettings({
          owner: "@acme",
          agents: [],
          skills: row.configured === undefined ? {} : { review: row.configured },
        });
        writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
          parent: "skills",
        });
        const before = created.snapshot();

        const failure = yield* ChangeAuthoredVersion.prepare({
          fqn: row.handle,
          change: row.change,
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)), Effect.flip);

        expect(failure).toMatchObject({ _tag: row.tag });
        expect(created.snapshot()).toEqual(before);
      }),
    );
});
