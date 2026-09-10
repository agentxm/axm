import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  HookManifestSchema,
  type HookEvent,
  type HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";

import { CreateExtension } from "../../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/new/creates-enabled-workspace-content",
  title: "Creating a hook records editable workspace content",
  statement:
    "When a person creates a hook, AXM shall create its manifest and a runnable starter entrypoint for the requested runtime in the workspace authoring directory, bind it to the requested event with a matcher only where the event is tool-scoped, register it as enabled workspace-authored content, and project it into the agent hook configurations.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "The manifest, the entrypoint, the declaration, and the agent hook configuration are all written by the creation use case over the workspace-state services; a real project directory observes each one.",
  derivedFrom: ["packages/core/extension-authoring/src/create/scaffolds/hook.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const createHook = (
  target: AuthoringWorkspace,
  hook: {
    readonly runtime: HookRuntime;
    readonly event: HookEvent;
    readonly matcher: Option.Option<string>;
  },
) =>
  Effect.gen(function* () {
    const candidate = yield* CreateExtension.prepare({
      type: "hook",
      name: "review",
      owner: Option.none(),
      runtime: hook.runtime,
      event: hook.event,
      matcher: hook.matcher,
    });
    return yield* CreateExtension.previewOrApply(candidate, applyExecution);
  }).pipe(Effect.provide(authoringWorkspaceLayer(target)));

describe("Creating a hook", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (): AuthoringWorkspace => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createHook(created, {
        runtime: "bash",
        event: "tool.pre",
        matcher: Option.none(),
      });

      const manifest = Schema.decodeUnknownSync(HookManifestSchema)(
        JSON.parse(created.read("hooks/review/hook.json") ?? "null"),
      );
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "hook",
        name: "review",
        runtime: "bash",
        entrypoint: "src/hook.sh",
      });
      expect(created.settings()).toMatchObject({ hooks: { review: "workspace" } });
      expect(JSON.stringify(created.settings())).not.toContain('"enabled":false');
      expect(created.read("hooks/review/src/hook.sh")).toContain("#!/usr/bin/env bash");
      expect(created.read(".claude/settings.json")).toContain("review");
    }),
  );

  for (const example of [
    {
      runtime: "bash",
      filename: "hook.sh",
      event: "tool.pre",
      matcher: Option.some("Write|Edit"),
      binding: { on: "tool.pre", matcherRaw: "Write|Edit" },
    },
    {
      runtime: "node",
      filename: "hook.js",
      event: "tool.post",
      matcher: Option.some("Write"),
      binding: { on: "tool.post", matcherRaw: "Write" },
    },
    {
      runtime: "python",
      filename: "hook.py",
      event: "session.start",
      matcher: Option.some("Write"),
      binding: { on: "session.start" },
    },
  ] as const)
    it.effect(`scaffolds ${example.runtime} for ${example.event}`, () =>
      Effect.gen(function* () {
        const created = workspace();

        yield* createHook(created, {
          runtime: example.runtime,
          event: example.event,
          matcher: example.matcher,
        });

        expect(JSON.parse(created.read("hooks/review/hook.json") ?? "null")).toEqual(
          expect.objectContaining({
            runtime: example.runtime,
            entrypoint: `src/${example.filename}`,
            bindings: [example.binding],
          }),
        );
        expect(created.exists(`hooks/review/src/${example.filename}`)).toBe(true);
      }),
    );
});
