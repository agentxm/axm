import type { Doc, Status, TableColumnPriority, Text } from "./doc.js";

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

/** The status mark of a row that needs attention, or `undefined` for one that does not. */
type ViewRowMark<T> = (row: T) => Status | undefined;

export const tableDoc = <T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<ViewColumn<T>>,
  options?: { readonly caption?: Text; readonly mark?: ViewRowMark<T> },
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
    rows: rows.map((row) => {
      const mark = options?.mark?.(row);
      return {
        cells: columns.map((column) => column.value(row)),
        ...(mark === undefined ? {} : { mark }),
      };
    }),
    ...(options?.caption === undefined ? {} : { caption: options.caption }),
  },
];

export const fieldsDoc = <T>(row: T, fields: ReadonlyArray<ViewField<T>>): Doc => [
  {
    _tag: "fields",
    fields: fields.map((field) => ({ label: field.label, value: field.value(row) })),
  },
];

const summaryDoc = (summary: string | ReadonlyArray<Text> | undefined): Doc =>
  summary === undefined
    ? []
    : [
        typeof summary === "string"
          ? { _tag: "paragraph", text: summary }
          : { _tag: "summary", parts: summary.map((text) => ({ text })) },
      ];

/**
 * An inventory: its rows as a table and the summary sentence after it, or —
 * when there is nothing to list — the empty state alone, which says what is
 * true and may name the one next step.
 */
export const inventoryDoc = <T>(options: {
  readonly rows: ReadonlyArray<T>;
  readonly columns: ReadonlyArray<ViewColumn<T>>;
  /** One sentence, or several parts the painter joins with its separator. */
  readonly summary?: string | ReadonlyArray<Text>;
  readonly mark?: ViewRowMark<T>;
  readonly empty: string | Doc;
}): Doc =>
  options.rows.length === 0
    ? typeof options.empty === "string"
      ? [{ _tag: "paragraph", text: options.empty }]
      : options.empty
    : [
        ...tableDoc(
          options.rows,
          options.columns,
          options.mark === undefined ? undefined : { mark: options.mark },
        ),
        ...summaryDoc(options.summary),
      ];
