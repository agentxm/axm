import type { Doc, TableColumnPriority, Text } from "./doc.js";

export interface ViewColumn<T> {
  readonly header: Text;
  readonly value: (row: T) => Text;
  readonly align?: "left" | "right";
  readonly width?: number;
  readonly minWidth?: number;
  readonly priority?: TableColumnPriority;
}

export interface ViewField<T> {
  readonly label: Text;
  readonly value: (row: T) => Text;
}

export const tableDoc = <T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<ViewColumn<T>>,
  caption?: Text,
): Doc => [
  {
    _tag: "table",
    columns: columns.map((column) => ({
      header: column.header,
      ...(column.align === undefined ? {} : { align: column.align }),
      ...(column.width === undefined ? {} : { width: column.width }),
      ...(column.minWidth === undefined ? {} : { minWidth: column.minWidth }),
      ...(column.priority === undefined ? {} : { priority: column.priority }),
    })),
    rows: rows.map((row) => columns.map((column) => column.value(row))),
    ...(caption === undefined ? {} : { caption }),
  },
];

export const fieldsDoc = <T>(row: T, fields: ReadonlyArray<ViewField<T>>): Doc => [
  {
    _tag: "fields",
    fields: fields.map((field) => ({ label: field.label, value: field.value(row) })),
  },
];

export const inventoryDoc = <T>(options: {
  readonly rows: ReadonlyArray<T>;
  readonly columns: ReadonlyArray<ViewColumn<T>>;
  readonly summary: string;
  readonly empty: string;
}): Doc =>
  options.rows.length === 0
    ? [{ _tag: "paragraph", text: options.empty }]
    : tableDoc(options.rows, options.columns, options.summary);
