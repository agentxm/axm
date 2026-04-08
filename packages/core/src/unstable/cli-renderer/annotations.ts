import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Annotation keys — namespaced strings.
//
// Effect v4's Schema.Annotations.Annotations type only supports string keys
// (readonly [x: string]: unknown). Symbol keys are not supported at the type
// level even though they would work at runtime.
// ---------------------------------------------------------------------------

export const ColumnHeader = "axm/output/ColumnHeader";
export const ColumnPriority = "axm/output/ColumnPriority";
export const ColumnAlign = "axm/output/ColumnAlign";
export const ColumnWidth = "axm/output/ColumnWidth";
export const DisplayFormat = "axm/output/DisplayFormat";
export const Hidden = "axm/output/Hidden";

// ---------------------------------------------------------------------------
// Module augmentation — declare our annotation keys in Effect's type system
// so Schema.annotate accepts them without type errors.
// ---------------------------------------------------------------------------

declare module "effect/Schema" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Annotations {
    interface Annotations {
      readonly [ColumnHeader]?: string | undefined;
      readonly [ColumnPriority]?: number | undefined;
      readonly [ColumnAlign]?: "left" | "right" | undefined;
      readonly [ColumnWidth]?: "auto" | "fill" | number | undefined;
      readonly [DisplayFormat]?: ((value: unknown) => string) | undefined;
      readonly [Hidden]?: boolean | undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Annotation helpers
// ---------------------------------------------------------------------------

/**
 * Attach column display annotations to a schema field.
 *
 * The format function parameter uses `unknown` to match the Annotations
 * interface. Callers narrow the type at the call site.
 */
export const column =
  (opts: {
    readonly header: string;
    readonly priority?: number;
    readonly align?: "left" | "right";
    readonly width?: "auto" | "fill" | number;
    readonly format?: (value: unknown) => string;
  }) =>
  <S extends Schema.Top>(schema: S): S["~rebuild.out"] =>
    schema.annotate({
      [ColumnHeader]: opts.header,
      [ColumnPriority]: opts.priority ?? 0,
      [ColumnAlign]: opts.align ?? "left",
      [ColumnWidth]: opts.width ?? "auto",
      ...(opts.format && { [DisplayFormat]: opts.format }),
    });

/**
 * Mark a schema field as hidden from table/detail output.
 */
export const hidden =
  () =>
  <S extends Schema.Top>(schema: S): S["~rebuild.out"] =>
    schema.annotate({ [Hidden]: true });
