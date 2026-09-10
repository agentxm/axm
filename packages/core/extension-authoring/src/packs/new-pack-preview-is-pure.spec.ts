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
  requirement: "cli/packs/new/preview-is-pure",
  title: "Pack creation preview describes the scaffold without creating any state",
  statement:
    "When pack creation is previewed, it shall report the manifest and settings entry it would create with a previewed outcome and shall not create the authored package or record the pack; a previewed creation refused because the pack is already authored shall likewise change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the creation use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: ["cli/packs/new/records-workspace-authorship"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PACK = "toolkit";

describe("Pack creation preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (): AuthoringWorkspace => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(created.cleanup);
    return created;
  };

  const createPack = (target: AuthoringWorkspace, mode: "preview" | "apply") =>
    Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare({
        type: "pack",
        name: PACK,
        owner: Option.none(),
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

      const resolution = yield* createPack(created, "preview");

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: `@acme/packs/${PACK}`, state: "ready" }),
      ]);
      expect(created.tree()).toEqual(before);
      expect(created.exists(`packs/${PACK}`)).toBe(false);
      expect(JSON.stringify(created.settings())).not.toContain(PACK);
    }),
  );

  it.effect("a previewed creation of an already-authored pack changes nothing", () =>
    Effect.gen(function* () {
      const created = workspace();
      yield* createPack(created, "apply");
      const before = created.tree();

      const failure = yield* createPack(created, "preview").pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: "CreateNameConfigured", name: PACK });
      expect(created.tree()).toEqual(before);
    }),
  );
});
