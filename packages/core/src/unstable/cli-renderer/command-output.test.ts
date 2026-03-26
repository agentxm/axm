import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as ServiceMap from "effect/ServiceMap";
import { describe, expect, it } from "vitest";

import { column, hidden } from "./annotations.js";
import { columnsFrom, emitMany, emitOne } from "./command-output.js";
import { CliRenderer } from "./cli-renderer.js";

// ---------------------------------------------------------------------------
// Assertion helper — avoids non-null assertions per project conventions
// ---------------------------------------------------------------------------
function assertDefined<T>(value: T | undefined, msg: string): asserts value is T {
  if (value === undefined) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Test schemas
// ---------------------------------------------------------------------------

const SkillRow = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name", width: "fill" })),
  version: Schema.String.pipe(column({ header: "Version", align: "right" })),
  status: Schema.String.pipe(
    column({
      header: "Status",
      format: (v) => String(v).toUpperCase(),
    }),
  ),
  internalId: Schema.String.pipe(hidden()),
});
type SkillRow = typeof SkillRow.Type;

// ---------------------------------------------------------------------------
// columnsFrom tests
// ---------------------------------------------------------------------------

describe("columnsFrom", () => {
  it("extracts visible annotated columns", () => {
    const cols = columnsFrom(SkillRow);
    expect(cols).toHaveLength(3);
    expect(cols.map((c) => c.key)).toEqual(["name", "version", "status"]);
  });

  it("skips hidden fields", () => {
    const cols = columnsFrom(SkillRow);
    expect(cols.find((c) => c.key === "internalId")).toBeUndefined();
  });

  it("applies format function via value accessor", () => {
    const cols = columnsFrom(SkillRow);
    const statusCol = cols.find((c) => c.key === "status");
    assertDefined(statusCol, "Expected 'status' column");
    const row: SkillRow = {
      name: "test",
      version: "1.0.0",
      status: "active",
      internalId: "abc",
    };
    expect(statusCol.value(row)).toBe("ACTIVE");
  });

  it("returns string representation for non-formatted fields", () => {
    const cols = columnsFrom(SkillRow);
    const nameCol = cols.find((c) => c.key === "name");
    assertDefined(nameCol, "Expected 'name' column");
    const row: SkillRow = {
      name: "my-skill",
      version: "1.0.0",
      status: "active",
      internalId: "abc",
    };
    expect(nameCol.value(row)).toBe("my-skill");
  });

  it("preserves column metadata", () => {
    const cols = columnsFrom(SkillRow);
    const versionCol = cols.find((c) => c.key === "version");
    assertDefined(versionCol, "Expected 'version' column");
    expect(versionCol.header).toBe("Version");
    expect(versionCol.align).toBe("right");
    expect(versionCol.priority).toBe(0);
    expect(versionCol.width).toBe("auto");
  });

  it("returns empty array for non-Objects AST", () => {
    const cols = columnsFrom(Schema.String);
    expect(cols).toEqual([]);
  });

  it("returns empty array for struct with no annotated fields", () => {
    const PlainStruct = Schema.Struct({
      a: Schema.String,
      b: Schema.Number,
    });
    const cols = columnsFrom(PlainStruct);
    expect(cols).toEqual([]);
  });

  it("value accessor returns empty string for null/undefined values", () => {
    const TestRow = Schema.Struct({
      name: Schema.NullOr(Schema.String).pipe(column({ header: "Name" })),
    });
    const cols = columnsFrom(TestRow);
    expect(cols).toHaveLength(1);
    const nameCol = cols[0];
    assertDefined(nameCol, "Expected at least one column");
    const row = { name: null };
    expect(nameCol.value(row)).toBe("");
  });

  it("handles branded types", () => {
    const SkillName = Schema.String.pipe(Schema.brand("SkillName"));
    const BrandedRow = Schema.Struct({
      name: SkillName.pipe(column({ header: "Skill Name" })),
    });
    const cols = columnsFrom(BrandedRow);
    expect(cols).toHaveLength(1);
    const nameCol = cols[0];
    assertDefined(nameCol, "Expected at least one column");
    expect(nameCol.header).toBe("Skill Name");
  });

  it("handles literal union fields", () => {
    const Status = Schema.Literals(["active", "inactive", "pending"]);
    const EnumRow = Schema.Struct({
      status: Status.pipe(
        column({
          header: "Status",
          format: (v) => String(v).toUpperCase(),
        }),
      ),
    });
    const cols = columnsFrom(EnumRow);
    expect(cols).toHaveLength(1);
    const statusCol = cols[0];
    assertDefined(statusCol, "Expected at least one column");
    expect(statusCol.header).toBe("Status");
  });

  it("only extracts flat annotated properties, ignores nested struct without annotations", () => {
    const Address = Schema.Struct({
      street: Schema.String.pipe(column({ header: "Street" })),
      city: Schema.String.pipe(column({ header: "City" })),
    });
    const PersonRow = Schema.Struct({
      name: Schema.String.pipe(column({ header: "Name" })),
      address: Address,
    });
    const cols = columnsFrom(PersonRow);
    expect(cols).toHaveLength(1);
    expect(cols[0]?.key).toBe("name");
  });

  it("handles nested struct annotated with column and format", () => {
    const Address = Schema.Struct({
      street: Schema.String,
      city: Schema.String,
    });
    const PersonRowWithAddress = Schema.Struct({
      name: Schema.String.pipe(column({ header: "Name" })),
      address: Address.pipe(
        column({
          header: "Address",
          format: (v) => {
            const rec = v as Record<string, unknown>;
            return `${String(rec["street"])}, ${String(rec["city"])}`;
          },
        }),
      ),
    });

    const cols = columnsFrom(PersonRowWithAddress);
    expect(cols).toHaveLength(2);

    const addressCol = cols.find((c) => c.key === "address");
    assertDefined(addressCol, "Expected 'address' column");
    expect(addressCol.header).toBe("Address");

    type PersonWithAddress = typeof PersonRowWithAddress.Type;
    const row: PersonWithAddress = {
      name: "Alice",
      address: { street: "123 Main", city: "Springfield" },
    };
    expect(addressCol.value(row)).toBe("123 Main, Springfield");
  });

  describe("optional fields", () => {
    it("handles annotations placed BEFORE optional by traversing Union members", () => {
      const WithOptional = Schema.Struct({
        name: Schema.String.pipe(column({ header: "Name" })),
        description: Schema.optional(Schema.String.pipe(column({ header: "Description" }))),
      });
      const cols = columnsFrom(WithOptional);
      // Should find both: name and description (via Union member traversal)
      const descCol = cols.find((c) => c.key === "description");
      assertDefined(descCol, "Expected 'description' column");
      expect(descCol.header).toBe("Description");
    });
  });
});

// ---------------------------------------------------------------------------
// Mock CliRenderer for emitMany/emitOne tests
// ---------------------------------------------------------------------------

interface MockCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

const makeMockRenderer = (resultReturns: boolean) => {
  const calls: MockCall[] = [];
  // Assertion needed: mock object shape matches CliRenderer but TS cannot verify generic methods
  const service = {
    intro: () => Effect.void,
    outro: () => Effect.void,
    message: () => Effect.void,
    info: () => Effect.void,
    success: () => Effect.void,
    step: () => Effect.void,
    warn: () => Effect.void,
    error: () => Effect.void,
    cancel: () => Effect.void,
    note: () => Effect.void,
    box: () => Effect.void,
    streamLog: () => Effect.void,
    spinner: () => Effect.void,
    withSpinner: () => Effect.void,
    progress: () => Effect.void,
    withProgress: () => Effect.void,
    taskLog: () => Effect.void,
    withTaskLog: () => Effect.void,
    runTasks: () => Effect.void,
    table: (...args: ReadonlyArray<unknown>) => {
      calls.push({ method: "table", args });
      return Effect.void;
    },
    detail: (...args: ReadonlyArray<unknown>) => {
      calls.push({ method: "detail", args });
      return Effect.void;
    },
    tree: () => Effect.void,
    result: (...args: ReadonlyArray<unknown>) => {
      calls.push({ method: "result", args });
      return Effect.succeed(resultReturns);
    },
    resultStream: () => Effect.succeed(resultReturns),
    json: () => Effect.void,
    raw: () => Effect.void,
  } as unknown as ServiceMap.Service.Shape<typeof CliRenderer>;
  const layer = Layer.succeed(CliRenderer, service);
  return { calls, layer };
};

// ---------------------------------------------------------------------------
// emitMany tests
// ---------------------------------------------------------------------------

describe("emitMany", () => {
  const SimpleRow = Schema.Struct({
    name: Schema.String.pipe(column({ header: "Name" })),
  });
  type SimpleRow = typeof SimpleRow.Type;

  const items: ReadonlyArray<SimpleRow> = [{ name: "alpha" }, { name: "beta" }];

  it("calls result() then table() when result returns false", async () => {
    const mock = makeMockRenderer(false);
    await Effect.runPromise(
      Effect.provide(emitMany(items, { schema: SimpleRow, title: "Skills" }), mock.layer),
    );
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]?.method).toBe("result");
    expect(mock.calls[1]?.method).toBe("table");
  });

  it("passes items and schema to result()", async () => {
    const mock = makeMockRenderer(false);
    await Effect.runPromise(Effect.provide(emitMany(items, { schema: SimpleRow }), mock.layer));
    const resultCall = mock.calls.find((c) => c.method === "result");
    assertDefined(resultCall, "Expected result() call");
    expect(resultCall.args[0]).toBe(items);
  });

  it("passes items, columns, and title to table()", async () => {
    const mock = makeMockRenderer(false);
    await Effect.runPromise(
      Effect.provide(emitMany(items, { schema: SimpleRow, title: "Skills" }), mock.layer),
    );
    const tableCall = mock.calls.find((c) => c.method === "table");
    assertDefined(tableCall, "Expected table() call");
    expect(tableCall.args[0]).toBe(items);
    // Second arg is the columns array
    const cols = tableCall.args[1] as ReadonlyArray<{ key: string }>;
    expect(cols.map((c) => c.key)).toEqual(["name"]);
    // Third arg is the title
    expect(tableCall.args[2]).toBe("Skills");
  });

  it("short-circuits when result() returns true (machine mode)", async () => {
    const mock = makeMockRenderer(true);
    await Effect.runPromise(Effect.provide(emitMany(items, { schema: SimpleRow }), mock.layer));
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.method).toBe("result");
    // table() should NOT be called
    expect(mock.calls.find((c) => c.method === "table")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// emitOne tests
// ---------------------------------------------------------------------------

describe("emitOne", () => {
  const SimpleRow = Schema.Struct({
    name: Schema.String.pipe(column({ header: "Name" })),
    version: Schema.String.pipe(column({ header: "Version" })),
  });
  type SimpleRow = typeof SimpleRow.Type;

  const item: SimpleRow = { name: "my-skill", version: "1.0.0" };

  it("calls result() then detail() when result returns false", async () => {
    const mock = makeMockRenderer(false);
    await Effect.runPromise(
      Effect.provide(emitOne(item, { schema: SimpleRow, title: "Skill Info" }), mock.layer),
    );
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]?.method).toBe("result");
    expect(mock.calls[1]?.method).toBe("detail");
  });

  it("passes item and schema to result()", async () => {
    const mock = makeMockRenderer(false);
    await Effect.runPromise(Effect.provide(emitOne(item, { schema: SimpleRow }), mock.layer));
    const resultCall = mock.calls.find((c) => c.method === "result");
    assertDefined(resultCall, "Expected result() call");
    expect(resultCall.args[0]).toBe(item);
  });

  it("passes item, columns, and title to detail()", async () => {
    const mock = makeMockRenderer(false);
    await Effect.runPromise(
      Effect.provide(emitOne(item, { schema: SimpleRow, title: "Skill Info" }), mock.layer),
    );
    const detailCall = mock.calls.find((c) => c.method === "detail");
    assertDefined(detailCall, "Expected detail() call");
    expect(detailCall.args[0]).toBe(item);
    const cols = detailCall.args[1] as ReadonlyArray<{ key: string }>;
    expect(cols.map((c) => c.key)).toEqual(["name", "version"]);
    expect(detailCall.args[2]).toBe("Skill Info");
  });

  it("short-circuits when result() returns true (machine mode)", async () => {
    const mock = makeMockRenderer(true);
    await Effect.runPromise(Effect.provide(emitOne(item, { schema: SimpleRow }), mock.layer));
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.method).toBe("result");
    expect(mock.calls.find((c) => c.method === "detail")).toBeUndefined();
  });
});
