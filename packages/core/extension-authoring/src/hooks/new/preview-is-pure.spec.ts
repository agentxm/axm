import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import { CreateExtension } from "../../create/create-extension.js";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/new/preview-is-pure",
  title: "Hook creation preview describes the scaffold without creating any state",
  statement:
    "When hook creation is previewed for an owner the workspace authors, it shall report the manifest, entrypoint, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, or agent hook configurations; a previewed creation the workspace refuses shall likewise change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: ["cli/hooks/new/creates-enabled-workspace-content"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const HOOK = "tool-audit";

describe("Hook creation preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (): AuthoringWorkspace => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    return created;
  };

  const previewCreation = (target: AuthoringWorkspace, owner: Option.Option<string>) =>
    Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare({
        type: "hook",
        name: HOOK,
        owner,
        runtime: "bash",
        event: "tool.pre",
        matcher: Option.none(),
      });
      return yield* CreateExtension.previewOrApply(candidate, previewExecution);
    }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

  it.effect("a previewed creation changes no protected state", () =>
    Effect.gen(function* () {
      const created = workspace();
      const before = created.tree();

      const resolution = yield* previewCreation(created, Option.none());

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: `@acme/hooks/${HOOK}`, state: "ready" }),
      ]);
      expect(created.tree()).toEqual(before);
      expect(created.exists(`hooks/${HOOK}`)).toBe(false);
      expect(created.exists(".claude/settings.json")).toBe(false);
      expect(JSON.stringify(created.settings())).not.toContain(HOOK);
    }),
  );

  it.effect("a previewed creation the workspace refuses changes nothing", () =>
    Effect.gen(function* () {
      const created = workspace();
      const before = created.tree();

      const failure = yield* previewCreation(created, Option.some("@other")).pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "AuthoringOwnerMismatch",
        requested: "@other",
        configured: "@acme",
      });
      expect(created.tree()).toEqual(before);
    }),
  );
});
