import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { handleInstall, handleSync } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { writeLocalSubagentPackage } from "../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/managed-projection-guidance-respects-authority",
  title: "Managed projections name editable sources only when the workspace owns them",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability", "knowledge-access"],
  methods: ["decision-table", "example"],
});

const writeAuthoredSubagentPackage = (workspaceRoot: string, name: string): void => {
  const packageRoot = path.join(workspaceRoot, "subagents", name);
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "subagent.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/subagent.schema.json",
        owner: "@acme",
        type: "subagent",
        name,
        version: "1.0.0",
        description: `The ${name} subagent.`,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", `${name}.md`),
    `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n# ${name}\n`,
  );
};

describe("Managed projection authoring guidance", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("a workspace-authored package names its canonical content as the editable source", () =>
    Effect.gen(function* () {
      const name = "authored-reviewer";
      const workspace = makeSpecWorkspace({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          subagents: { [name]: "workspace" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSubagentPackage(workspace.root, name);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const projection = workspace.readFile(`.claude/agents/${name}.md`);
      expect(projection).toContain(
        `axm:file v=1 ext=@acme/subagents/${name} src=subagents/${name}/src/${name}.md`,
      );
      expect(projection).toContain("Change the source, then run `axm sync`.");
      expect(projection).not.toContain("(acquired, immutable)");
      expect(projection).not.toContain("Use `axm fork`");
    }),
  );

  it.effect(
    "an acquired package retains provenance without presenting accepted content as editable",
    () =>
      Effect.gen(function* () {
        const name = "acquired-reviewer";
        const workspace = makeSpecWorkspace({ settings: { agents: ["claude-code"] } });
        cleanups.push(workspace.cleanup);
        const source = writeLocalSubagentPackage(workspace.root, { name });
        const sourceBefore = fs.readFileSync(path.join(source, "src", `${name}.md`), "utf8");

        yield* handleInstall({
          source: Option.some(source),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        const canonicalPath = `agent_extensions/local/vendor/${name}/src/${name}.md`;
        const projection = workspace.readFile(`.claude/agents/${name}.md`);
        expect(projection).toContain(
          `axm:file v=1 ext=@acme/subagents/${name} src=${canonicalPath}`,
        );
        expect(projection).toContain(`${canonicalPath} (acquired, immutable)`);
        expect(projection).toContain("Use `axm fork` to create an authored copy");
        expect(projection).not.toContain("Change the source");
        expect(projection).not.toContain("Edit:");
        expect(workspace.readFile(canonicalPath)).toBe(sourceBefore);
        expect(fs.readFileSync(path.join(source, "src", `${name}.md`), "utf8")).toBe(sourceBefore);
      }),
  );
});
