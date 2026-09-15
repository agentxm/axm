import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { insertManagedFileBanner } from "./managed-file-banner.js";

export const specification = defineSpecification({
  requirement: "cli/managed-projection-guidance-respects-authority",
  title: "Managed output points to an editable source or to the fork command",
  statement:
    "A managed projection shall direct edits to its source only when the workspace authors that extension, and for an acquired extension shall mark the canonical content immutable and point to axm fork instead.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability", "knowledge-access"],
  boundary: "memory",
  boundaryRationale:
    "The banner is composed from the provenance record a projection carries; giving the projection that record directly is what decides the guidance, and rendering it shows exactly the operator text a person reads.",
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** The subagent document a projection wraps, before any banner. */
const document = (name: string): string =>
  `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n# ${name}\n`;

describe("Managed projection authoring guidance", () => {
  it("a workspace-authored package names its canonical content as the editable source", () => {
    const name = "authored-reviewer";
    const source = `subagents/${name}/src/${name}.md`;

    const projection = insertManagedFileBanner(document(name), {
      ext: `@acme/subagents/${name}`,
      source: { kind: "workspace-authored", path: source },
      helpTopic: "subagents",
      format: "markdown",
    });

    expect(projection).toContain(`axm:file v=1 ext=@acme/subagents/${name} src=${source}`);
    expect(projection).toContain("Change the source, then run `axm sync`.");
    expect(projection).not.toContain("(acquired, immutable)");
    expect(projection).not.toContain("Use `axm fork`");
  });

  it("an acquired package retains provenance without presenting accepted content as editable", () => {
    const name = "acquired-reviewer";
    const canonicalPath = `agent_extensions/local/vendor/${name}/src/${name}.md`;
    const projection = insertManagedFileBanner(document(name), {
      ext: `@acme/subagents/${name}`,
      source: { kind: "acquired", path: canonicalPath },
      helpTopic: "subagents",
      format: "markdown",
    });

    expect(projection).toContain(`axm:file v=1 ext=@acme/subagents/${name} src=${canonicalPath}`);
    expect(projection).toContain(`${canonicalPath} (acquired, immutable)`);
    expect(projection).toContain("Use `axm fork` to create an authored copy");
    expect(projection).not.toContain("Change the source");
    expect(projection).not.toContain("Edit:");
    // The banner wraps the document; the accepted content it wraps is
    // reproduced verbatim. That the acquired package and its source are
    // themselves left unchanged is owned by
    // `cli/install/materializes-canonical-content` and
    // `cli/install/preserves-unrelated-and-unowned-state`.
    expect(projection).toContain(`name: ${name}`);
    expect(projection).toContain(`# ${name}`);
    expect(projection.split("-->").at(-1)?.trim()).toBe(`# ${name}`);
  });
});
