import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

import {
  ColumnHeader,
  ColumnPriority,
  ColumnAlign,
  ColumnWidth,
  DisplayFormat,
  Hidden,
} from "./annotations.js";
import { CliRenderer, type ColumnDef } from "./cli-renderer.js";

// ---------------------------------------------------------------------------
// columnsFrom — derive column definitions from a Schema's AST annotations.
//
// API notes:
// - SchemaAST.isObjects(ast) narrows to Objects with propertySignatures
// - SchemaAST.resolve(ast) returns annotations, handling checks-based paths
// - Annotations on inner types wrapped by Schema.optional are buried inside
//   Union members. When resolve() on the property type yields no ColumnHeader,
//   we traverse Union members to find them.
// ---------------------------------------------------------------------------

/**
 * Attempt to read annotations from the given AST node. If the node is a
 * Union (e.g. from Schema.optional wrapping), traverse its member types
 * and return annotations from the first member that carries a ColumnHeader.
 */
const resolveAnnotations = (ast: SchemaAST.AST): Readonly<Record<string, unknown>> | undefined => {
  const direct = SchemaAST.resolve(ast);
  if (direct?.[ColumnHeader] !== undefined) return direct;
  if (direct?.[Hidden] === true) return direct;

  // Traverse Union members for optional-wrapped annotations
  if (SchemaAST.isUnion(ast)) {
    for (const member of ast.types) {
      const memberAnn = SchemaAST.resolve(member);
      if (memberAnn?.[ColumnHeader] !== undefined) return memberAnn;
      if (memberAnn?.[Hidden] === true) return memberAnn;
    }
  }

  return direct;
};

const isStringRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Derives column definitions from a Schema's AST annotations.
 *
 * Iterates over property signatures of a Struct schema and extracts
 * column metadata from annotations set via `column()` and `hidden()`.
 */
export const columnsFrom = <T>(schema: Schema.Schema<T>): ReadonlyArray<ColumnDef<T>> => {
  const ast = schema.ast;
  if (!SchemaAST.isObjects(ast)) return [];

  return ast.propertySignatures
    .filter((ps) => {
      const ann = resolveAnnotations(ps.type);
      return ann?.[Hidden] !== true && ann?.[ColumnHeader] !== undefined;
    })
    .map((ps) => {
      const ann = resolveAnnotations(ps.type) ?? {};
      const key = String(ps.name);
      const format = ann[DisplayFormat];
      const header = ann[ColumnHeader];
      return {
        key,
        header: typeof header === "string" ? header : key,
        value: (item: T) => {
          const raw = isStringRecord(item) ? item[key] : undefined;
          if (typeof format === "function") return format(raw);
          if (raw == null) return "";
          return String(raw);
        },
        priority: typeof ann[ColumnPriority] === "number" ? ann[ColumnPriority] : 0,
        align: ann[ColumnAlign] === "right" ? "right" : "left",
        width: ((): "auto" | "fill" | number => {
          const w = ann[ColumnWidth];
          if (w === "fill" || typeof w === "number") return w;
          return "auto";
        })(),
      } satisfies ColumnDef<T>;
    });
};

// ---------------------------------------------------------------------------
// Command output helpers
// ---------------------------------------------------------------------------

export interface CommandOutputOpts<S extends Schema.Encoder<unknown, never>> {
  readonly schema: S;
  readonly title?: string;
}

/**
 * Emit a collection of items. In machine mode (result returns true),
 * outputs JSON. In interactive mode, renders a table.
 */
export const emitMany = <S extends Schema.Encoder<unknown, never>>(
  items: ReadonlyArray<S["Type"]>,
  opts: CommandOutputOpts<S>,
) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    if (yield* out.result(items, Schema.Array(opts.schema))) return;
    yield* out.table(items, columnsFrom(opts.schema), opts.title);
  });

/**
 * Emit a single item. In machine mode (result returns true),
 * outputs JSON. In interactive mode, renders a detail view.
 */
export const emitOne = <S extends Schema.Encoder<unknown, never>>(
  data: S["Type"],
  opts: CommandOutputOpts<S>,
) =>
  Effect.gen(function* () {
    const out = yield* CliRenderer;
    if (yield* out.result(data, opts.schema)) return;
    yield* out.detail(data, columnsFrom(opts.schema), opts.title);
  });
