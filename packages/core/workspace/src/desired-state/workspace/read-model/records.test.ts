import { describe, expect, it } from "vitest";
import {
  aggregateWorkspaceRecords,
  configuredRowsByName,
  installedRowsByName,
  unmanagedRowsByName,
  type WorkspaceRecordRow,
} from "./records.js";

const row = (
  name: string,
  lifecycle: WorkspaceRecordRow["classification"]["lifecycle"],
  values: Partial<WorkspaceRecordRow> = {},
): WorkspaceRecordRow => ({
  scope: "project",
  type: "skill",
  name,
  classification: { kind: "lifecycle", lifecycle },
  enabled: lifecycle === "configured" || lifecycle === "implicit" ? true : null,
  installed: true,
  agents: [],
  origins: [],
  paths: [],
  ...values,
});

describe("aggregateWorkspaceRecords", () => {
  it("deduplicates observed occurrences and prefers the strongest lifecycle claim", () => {
    const records = aggregateWorkspaceRecords([
      row("shared", "unmanaged", {
        agents: ["codex"],
        origins: ["agent-skill-dir"],
        paths: [".codex/skills/shared"],
      }),
      row("shared", "undeclared", { origins: ["canonical-axm-skill"], paths: ["skills/shared"] }),
      row("shared", "leftover", { paths: ["agent_extensions/shared"] }),
    ]);
    expect(records).toEqual([
      expect.objectContaining({
        name: "shared",
        classification: { kind: "lifecycle", lifecycle: "leftover" },
        agents: ["codex"],
        origins: ["agent-skill-dir", "canonical-axm-skill"],
        paths: [".codex/skills/shared", "agent_extensions/shared", "skills/shared"],
      }),
    ]);
    expect(Object.keys(unmanagedRowsByName(records))).toEqual(["shared"]);
  });

  it("keeps direct configuration and installed evidence from duplicate observations", () => {
    const records = aggregateWorkspaceRecords([
      row("review", "implicit", { installed: true, origins: ["agent-skill-dir"] }),
      row("review", "configured", { source: "workspace", enabled: false, installed: false }),
    ]);
    expect(records).toEqual([
      expect.objectContaining({
        classification: { kind: "lifecycle", lifecycle: "configured" },
        source: "workspace",
        enabled: false,
        installed: true,
      }),
    ]);
    expect(configuredRowsByName(records)["review"]?.source).toBe("workspace");
    expect(installedRowsByName(records)["review"]?.installed).toBe(true);
  });

  it("keeps scope and extension type as parts of the record identity", () => {
    const records = aggregateWorkspaceRecords([
      row("shared", "configured"),
      row("shared", "configured", { scope: "user" }),
      row("shared", "configured", { type: "hook" }),
    ]);
    expect(records).toHaveLength(3);
  });
});
