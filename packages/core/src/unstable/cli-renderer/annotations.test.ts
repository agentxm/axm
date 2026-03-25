import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { describe, expect, it } from "vitest";

import { column, hidden, ColumnHeader, ColumnPriority, ColumnAlign, ColumnWidth, DisplayFormat, Hidden } from "./annotations.js";

// ---------------------------------------------------------------------------
// Assertion helper — avoids non-null assertions per project conventions
// ---------------------------------------------------------------------------
function assertDefined<T>(value: T | undefined, msg: string): asserts value is T {
  if (value === undefined) throw new Error(msg);
}

describe("column()", () => {
  it("attaches header annotation to a schema", () => {
    const annotated = Schema.String.pipe(column({ header: "Name" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnHeader]).toBe("Name");
  });

  it("defaults priority to 0", () => {
    const annotated = Schema.String.pipe(column({ header: "Name" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnPriority]).toBe(0);
  });

  it("defaults align to left", () => {
    const annotated = Schema.String.pipe(column({ header: "Name" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnAlign]).toBe("left");
  });

  it("defaults width to auto", () => {
    const annotated = Schema.String.pipe(column({ header: "Name" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnWidth]).toBe("auto");
  });

  it("accepts custom priority", () => {
    const annotated = Schema.String.pipe(column({ header: "Name", priority: 5 }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnPriority]).toBe(5);
  });

  it("accepts right alignment", () => {
    const annotated = Schema.String.pipe(column({ header: "Version", align: "right" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnAlign]).toBe("right");
  });

  it("accepts fill width", () => {
    const annotated = Schema.String.pipe(column({ header: "Name", width: "fill" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnWidth]).toBe("fill");
  });

  it("accepts numeric width", () => {
    const annotated = Schema.String.pipe(column({ header: "Name", width: 20 }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnWidth]).toBe(20);
  });

  it("attaches format function when provided", () => {
    const format = (v: unknown) => String(v).toUpperCase();
    const annotated = Schema.String.pipe(column({ header: "Status", format }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[DisplayFormat]).toBe(format);
  });

  it("omits format annotation when not provided", () => {
    const annotated = Schema.String.pipe(column({ header: "Name" }));
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[DisplayFormat]).toBeUndefined();
  });

  it("works in a Struct field via pipe", () => {
    const Row = Schema.Struct({
      name: Schema.String.pipe(column({ header: "Name", width: "fill" })),
    });
    const ast = Row.ast;
    if (!SchemaAST.isObjects(ast)) throw new Error("Expected Objects AST");
    const nameProp = ast.propertySignatures.find((ps) => ps.name === "name");
    assertDefined(nameProp, "Expected 'name' property signature");
    const ann = SchemaAST.resolve(nameProp.type);
    expect(ann?.[ColumnHeader]).toBe("Name");
    expect(ann?.[ColumnWidth]).toBe("fill");
  });

  it("later annotations override earlier ones", () => {
    const annotated = Schema.String.pipe(
      column({ header: "First" }),
      column({ header: "Second" }),
    );
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[ColumnHeader]).toBe("Second");
  });
});

describe("hidden()", () => {
  it("attaches Hidden annotation", () => {
    const annotated = Schema.String.pipe(hidden());
    const ann = SchemaAST.resolve(annotated.ast);
    expect(ann?.[Hidden]).toBe(true);
  });

  it("works in a Struct field", () => {
    const Row = Schema.Struct({
      internalId: Schema.String.pipe(hidden()),
    });
    const ast = Row.ast;
    if (!SchemaAST.isObjects(ast)) throw new Error("Expected Objects AST");
    const prop = ast.propertySignatures.find((ps) => ps.name === "internalId");
    assertDefined(prop, "Expected 'internalId' property signature");
    const ann = SchemaAST.resolve(prop.type);
    expect(ann?.[Hidden]).toBe(true);
  });
});
