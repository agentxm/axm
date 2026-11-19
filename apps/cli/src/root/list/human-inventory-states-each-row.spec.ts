import { describe, expect, it } from "vitest";

import type { ExtensionListDocument } from "@agentxm/workspace-features/inspection";
import { defineSpecification } from "@agentxm/specification-metadata";

import { plain, type Doc, type Text } from "../../screen/doc.js";
import { listDoc } from "./view.js";

export const specification = defineSpecification({
  requirement: "cli/list/human-inventory-states-each-row",
  title: "A person's inventory states each row's local state in one column",
  statement:
    "When `axm list` renders an inventory for a person, each row shall state in one State column how desired state explains it and whether it is missing, of unknown installation, or disabled, its Source column shall name a registry extension's registry rather than repeat its identity, and an inventory with a row that `axm lint` explains shall offer `axm lint` as its next command.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The list view is a pure function of the inventory document, so the rendered document decides the obligation in memory.",
  methods: ["example"],
  derivedFrom: ["cli/list/human-inventory-reports-local-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

type ListItem = ExtensionListDocument["items"][number];

const item = (fqn: string, facts: Partial<ListItem> = {}): ListItem => ({
  fqn,
  type: "skill",
  name: fqn.split("/").at(-1) ?? fqn,
  scope: "project",
  management: "configured",
  installed: true,
  enabled: true,
  version: "1.0.0",
  source: { kind: "registry", locator: `company:${fqn}@^1.0.0`, identity: fqn },
  agents: { configured: [], observed: [] },
  inspection: { state: "not-requested" },
  assessment: { state: "not-checked" },
  ...facts,
});

const table = (doc: Doc) => {
  const node = doc.find((each) => each._tag === "table");
  if (node?._tag !== "table") throw new Error("expected a table");
  const headers = node.columns.map((column) => plain(column.header));
  return node.rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, plain(row.cells[index] ?? "")])),
  );
};

const summary = (doc: Doc): ReadonlyArray<Text> =>
  doc.flatMap((node) => (node._tag === "summary" ? node.parts.map((part) => part.text) : []));

describe("A person's inventory states each row", () => {
  const doc = listDoc({
    filter: "all",
    items: [
      item("@acme/skills/review"),
      item("@acme/skills/triage", { enabled: false }),
      item("@acme/skills/gone", { installed: false }),
      item("@legacy/skills/changelog", { management: "leftover", enabled: null }),
      item("github", { type: "mcp-server", source: { kind: "path", locator: "./github" } }),
    ],
  });

  it("states management and every departure from an installed, enabled row in one column", () => {
    const rows = table(doc);
    expect(rows.map((row) => row["State"])).toEqual([
      "managed",
      "managed, disabled",
      "managed, missing",
      "leftover",
      "managed",
    ]);
    expect(rows[0]).not.toHaveProperty("Management");
    expect(rows[0]).not.toHaveProperty("Installed");
  });

  it("names a registry extension's registry, and a path source by its path", () => {
    expect(table(doc).map((row) => row["Source"])).toEqual([
      "company",
      "company",
      "company",
      "company",
      "./github",
    ]);
  });

  it("offers axm lint as the next command", () => {
    const next = doc.flatMap((node) => (node._tag === "next" ? node.actions : []));
    expect(next.map((action) => action.cmd)).toEqual(["axm lint"]);
    expect(summary(doc).map((part) => plain(part))).not.toContain("run axm lint");
  });
});
