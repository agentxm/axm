import { describe, expect, it } from "vitest";

import type { DetailView, TableView } from "./output.js";
import { resolveDetailFields, resolveTableColumns } from "./command-output.js";

interface SkillRow {
  readonly name: string;
  readonly version: string;
  readonly status: "active" | "inactive";
  readonly notes: string | null;
}

const SkillTable = {
  columns: {
    name: { header: "Name", width: "fill" },
    version: { header: "Version", align: "right" },
    status: {
      header: "Status",
      render: (value: SkillRow["status"]) => value.toUpperCase(),
    },
    notes: { header: "Notes" },
  },
} as const satisfies TableView<SkillRow>;

const SkillDetail = {
  fields: {
    name: { label: "Name" },
    version: { label: "Version" },
    status: {
      label: "Status",
      render: (value: SkillRow["status"]) => value.toUpperCase(),
    },
    notes: { label: "Notes" },
  },
} as const satisfies DetailView<SkillRow>;

function assertDefined<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined) {
    throw new Error(message);
  }
}

describe("resolveTableColumns", () => {
  it("preserves configured column order", () => {
    const columns = resolveTableColumns(SkillTable);
    expect(columns.map((column) => column.key)).toEqual(["name", "version", "status", "notes"]);
  });

  it("preserves configured metadata", () => {
    const columns = resolveTableColumns(SkillTable);
    const version = columns.find((column) => column.key === "version");
    assertDefined(version, "Expected version column");
    expect(version.header).toBe("Version");
    expect(version.align).toBe("right");
    expect(version.width).toBe("auto");

    const name = columns.find((column) => column.key === "name");
    assertDefined(name, "Expected name column");
    expect(name.width).toBe("fill");
  });

  it("uses custom render functions when present", () => {
    const columns = resolveTableColumns(SkillTable);
    const status = columns.find((column) => column.key === "status");
    assertDefined(status, "Expected status column");
    expect(
      status.render({
        name: "review",
        version: "1.0.0",
        status: "active",
        notes: null,
      }),
    ).toBe("ACTIVE");
  });

  it("falls back to default string rendering when render is absent", () => {
    const columns = resolveTableColumns(SkillTable);
    const notes = columns.find((column) => column.key === "notes");
    assertDefined(notes, "Expected notes column");
    expect(
      notes.render({
        name: "review",
        version: "1.0.0",
        status: "active",
        notes: null,
      }),
    ).toBe("");
  });
});

describe("resolveDetailFields", () => {
  it("preserves configured field order", () => {
    const fields = resolveDetailFields(SkillDetail);
    expect(fields.map((field) => field.key)).toEqual(["name", "version", "status", "notes"]);
  });

  it("preserves labels", () => {
    const fields = resolveDetailFields(SkillDetail);
    const name = fields.find((field) => field.key === "name");
    assertDefined(name, "Expected name field");
    expect(name.label).toBe("Name");
  });

  it("uses custom render functions when present", () => {
    const fields = resolveDetailFields(SkillDetail);
    const status = fields.find((field) => field.key === "status");
    assertDefined(status, "Expected status field");
    expect(
      status.render({
        name: "review",
        version: "1.0.0",
        status: "inactive",
        notes: "needs publish",
      }),
    ).toBe("INACTIVE");
  });

  it("falls back to default string rendering when render is absent", () => {
    const fields = resolveDetailFields(SkillDetail);
    const version = fields.find((field) => field.key === "version");
    assertDefined(version, "Expected version field");
    expect(
      version.render({
        name: "review",
        version: "2.0.0",
        status: "active",
        notes: "ready",
      }),
    ).toBe("2.0.0");
  });
});
