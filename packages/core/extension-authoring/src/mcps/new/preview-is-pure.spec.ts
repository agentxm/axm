import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import { CreateExtension } from "../../create/create-extension.js";
import {
  authoringWorkspaceEnvironment,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/new/preview-is-pure",
  title: "New MCP server preview describes the scaffold without changing any state",
  statement:
    "When mcps new runs in preview mode for a name that is not yet authored, it shall report the package it would create with a previewed outcome and shall not change settings, the authored source root, or agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write — settings, authored root, and agent MCP config — that could have happened.",
  derivedFrom: ["packages/core/extension-authoring/src/create/scaffolds/mcp-server.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("New MCP server preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const previewNew = (created: AuthoringWorkspace, owner: Option.Option<string>) => {
    const environment = authoringWorkspaceEnvironment(created);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* CreateExtension.prepare({
          type: "mcp-server",
          name: "context",
          owner,
          description: Option.none(),
          nonInteractive: true,
        });
        return yield* CreateExtension.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.provide(environment.layer)),
    };
  };

  const workspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    return { created, before: created.snapshot() };
  };

  it.effect("a previewed scaffold changes no protected state", () =>
    Effect.gen(function* () {
      const { created, before } = workspace();
      const { environment, run } = previewNew(created, Option.none());

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: "@acme/mcps/context", state: "ready" }),
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(created.exists("mcps")).toBe(false);
      expect(JSON.stringify(created.settings())).not.toContain("context");
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect(
    "a previewed scaffold under a foreign owner reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const { created, before } = workspace();
        const { environment, run } = previewNew(created, Option.some("@other"));

        const failure = yield* run.pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "AuthoringOwnerMismatch",
          requested: "@other",
          configured: "@acme",
        });
        expect(created.snapshot()).toEqual(before);
        expect(created.exists("mcps")).toBe(false);
        expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
      }),
  );
});
