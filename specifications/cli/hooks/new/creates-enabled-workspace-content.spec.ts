import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { extensionName, handleHooksNew } from "axm.sh/specification-harness";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { authoringTypes, readPackageJson } from "../../../support/authoring-fixtures.js";
import { createNewExtension } from "../../../support/new-extension-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/new/creates-enabled-workspace-content",
  title: "Creating a hook records editable workspace content",
  statement:
    "When a person creates a hook, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: ["packages/cli/src/root/hooks/new.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creating a hook", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = workspace({ settings: { agents: ["claude-code"] } });
      const row = authoringTypes.find((item) => item.type === "hook");
      if (row === undefined) throw new Error("Required type row missing");
      yield* createNewExtension(row, "review").pipe(Effect.provide(created.layer));
      expect(readPackageJson(created.root, "hooks/review/hook.json")).toMatchObject({
        owner: "@acme",
        type: "hook",
        name: "review",
        ...{ runtime: "bash", entrypoint: "src/hook.sh", bindings: [{ on: "tool.pre" }] },
      });
      expect(created.readSettings()).toMatchObject({ [row.settingsKey]: { review: "workspace" } });
      expect(JSON.stringify(created.readSettings())).not.toContain('"enabled":false');
      expect(created.readFile("hooks/review/src/hook.sh")).toContain("#!/usr/bin/env bash");
      expect(created.readFile(".claude/settings.json")).toContain("review");
    }),
  );
  for (const example of [
    {
      runtime: "bash",
      filename: "hook.sh",
      event: "tool.pre",
      matcher: "Write|Edit",
      binding: { on: "tool.pre", matcherRaw: "Write|Edit" },
    },
    {
      runtime: "node",
      filename: "hook.js",
      event: "tool.post",
      matcher: "Write",
      binding: { on: "tool.post", matcherRaw: "Write" },
    },
    {
      runtime: "python",
      filename: "hook.py",
      event: "session.start",
      matcher: "Write",
      binding: { on: "session.start" },
    },
  ] as const)
    it.effect(`scaffolds ${example.runtime} for ${example.event}`, () =>
      Effect.gen(function* () {
        const created = workspace({ settings: { agents: ["claude-code"] } });
        yield* handleHooksNew({
          name: extensionName("review"),
          owner: Option.none(),
          runtime: example.runtime,
          event: example.event,
          matcher: Option.some(example.matcher),
          preview: false,
        }).pipe(Effect.provide(created.layer));
        expect(readPackageJson(created.root, "hooks/review/hook.json")).toEqual(
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
