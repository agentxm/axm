import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import { CreateExtension } from "../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/new/preview-is-pure",
  title: "Knowledge bundle creation preview describes the scaffold without creating any state",
  statement:
    "When knowledge bundle creation is previewed, it shall report the manifest, bundle index, and settings entry it would create with a previewed outcome and shall not change settings, the lockfile, authored source, or canonical content; a previewed creation refused because the name is already authored shall likewise change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: ["cli/knowledge/new/creates-enabled-workspace-content"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const BUNDLE = "platform";

describe("Knowledge bundle creation preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (): AuthoringWorkspace => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    return created;
  };

  const createBundle = (target: AuthoringWorkspace, mode: "preview" | "apply") =>
    Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare({
        type: "knowledge",
        name: BUNDLE,
        owner: Option.none(),
        description: Option.none(),
      });
      return yield* CreateExtension.previewOrApply(
        candidate,
        mode === "preview" ? previewExecution : applyExecution,
      );
    }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

  it.effect("a previewed creation changes no protected state", () =>
    Effect.gen(function* () {
      const created = workspace();
      const before = created.tree();

      const resolution = yield* createBundle(created, "preview");

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: `@acme/knowledge/${BUNDLE}`, state: "ready" }),
      ]);
      expect(created.tree()).toEqual(before);
      expect(created.exists(`knowledge/${BUNDLE}`)).toBe(false);
      expect(JSON.stringify(created.settings())).not.toContain(BUNDLE);
    }),
  );

  it.effect("a previewed creation of an already-authored bundle changes nothing", () =>
    Effect.gen(function* () {
      const created = workspace();
      yield* createBundle(created, "apply");
      const before = created.tree();

      const failure = yield* createBundle(created, "preview").pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: "CreateNameConfigured", name: BUNDLE });
      expect(created.tree()).toEqual(before);
    }),
  );
});
