import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  HookManifestSchema,
  type HookRuntime,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";

import { CreateExtension } from "../../index.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  type AuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/new/creates-inactive-workspace-content",
  title: "Creating a hook records editable workspace content",
  statement:
    "When a person creates a hook, AXM shall create its manifest and a runnable starter entrypoint for the requested runtime in the workspace authoring directory, bind it to the requested native protocol and event with its explicit matcher, register it as inactive workspace-authored content with applicable and nonapplicable fixtures, and leave native agent configurations unchanged.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "The manifest, the entrypoint, the declaration, and the agent hook configuration are all written by the creation use case over the workspace-state services; a real project directory observes each one.",
  derivedFrom: ["packages/core/workspace-features/src/authoring/create/scaffolds/hook.ts"],
  supersedes: ["cli/hooks/new/creates-enabled-workspace-content"],
  assumptions: [],
  openQuestions: [],
});

const createHook = (
  target: AuthoringWorkspace,
  hook: {
    readonly runtime: HookRuntime;
    readonly event: string;
    readonly matcher: Option.Option<string>;
  },
) =>
  Effect.gen(function* () {
    const candidate = yield* CreateExtension.prepare({
      type: "hook",
      name: "review",
      owner: Option.none(),
      runtime: hook.runtime,
      protocol: "claude-code",
      event: hook.event,
      matcher: hook.matcher,
    });
    const result = yield* CreateExtension.previewOrApply(candidate, applyExecution);
    expect(
      result.units.every((unit) => unit.state === "committed"),
      JSON.stringify(result),
    ).toBe(true);
    return result;
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

  it.effect("creates editable content and an inactive workspace declaration", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createHook(created, {
        runtime: "bash",
        event: "PreToolUse",
        matcher: Option.none(),
      });

      const manifest = Schema.decodeUnknownSync(HookManifestSchema)(
        JSON.parse(created.read("hooks/review/hook.json") ?? "null"),
      );
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "hook",
        name: "review",
        implementations: [
          {
            protocol: "claude-code",
            bindings: [
              { event: "PreToolUse", handler: { runtime: "bash", entrypoint: "src/hook.sh" } },
            ],
          },
        ],
      });
      expect(created.settings()).toMatchObject({
        hooks: { review: { source: "workspace", enabled: false } },
      });
      expect(manifest.fixtures?.map((fixture) => fixture.id)).toEqual([
        "applicable",
        "nonapplicable",
      ]);
      expect(created.read("hooks/review/src/hook.sh")).toContain("#!/usr/bin/env bash");
      expect(created.exists(".claude/settings.json")).toBe(false);
    }),
  );

  it.effect("leaves existing native configuration untouched while inactive", () =>
    Effect.gen(function* () {
      const created = workspace();
      const foreign = "Native configuration that AXM cannot decode\n";
      created.write(".claude/settings.json", foreign);
      yield* createHook(created, {
        runtime: "node",
        event: "SessionStart",
        matcher: Option.none(),
      });
      expect(created.read(".claude/settings.json")).toBe(foreign);
      expect(created.settings()).toMatchObject({
        hooks: { review: { source: "workspace", enabled: false } },
      });
    }),
  );

  for (const example of [
    {
      runtime: "bash",
      filename: "hook.sh",
      event: "PreToolUse",
      matcher: Option.some("Write|Edit"),
      binding: { event: "PreToolUse", matcher: "Write|Edit" },
    },
    {
      runtime: "node",
      filename: "hook.js",
      event: "PostToolUse",
      matcher: Option.some("Write"),
      binding: { event: "PostToolUse", matcher: "Write" },
    },
    {
      runtime: "python",
      filename: "hook.py",
      event: "SessionStart",
      matcher: Option.some("Write"),
      binding: { event: "SessionStart", matcher: "Write" },
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

        expect(JSON.parse(created.read("hooks/review/hook.json") ?? "null")).toMatchObject({
          implementations: [
            {
              protocol: "claude-code",
              bindings: [
                {
                  ...example.binding,
                  handler: { runtime: example.runtime, entrypoint: `src/${example.filename}` },
                },
              ],
            },
          ],
        });
        expect(created.exists(`hooks/review/src/${example.filename}`)).toBe(true);
      }),
    );
});
