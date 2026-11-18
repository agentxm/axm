import { plain, type Doc, type Status, type TableColumnPriority, type Text } from "./doc.js";

export interface ViewColumn<T> {
  readonly header: Text;
  readonly value: (row: T) => Text;
  readonly align?: "left" | "right";
  readonly width?: number;
  readonly minWidth?: number;
  readonly priority?: TableColumnPriority;
  /** The column that identifies each row; see `TableColumn.role`. */
  readonly role?: "name";
  /**
   * What an inventory's summary says instead of this column when every row
   * holds the same value, given one of those rows; `undefined` says nothing.
   * A column that repeats one value tells a reader nothing row by row, so it
   * is stated once.
   */
  readonly whenUniform?: (row: T) => Text | undefined;
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
      ...(column.role === undefined ? {} : { role: column.role }),
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

/** A column with a stated uniform form whose rows, two or more, all hold one value. */
const isUniform = <T>(column: ViewColumn<T>, rows: ReadonlyArray<T>): boolean => {
  const [first, ...rest] = rows;
  if (column.whenUniform === undefined || first === undefined || rest.length === 0) return false;
  const value = plain(column.value(first));
  return rest.every((row) => plain(column.value(row)) === value);
};

/**
 * An inventory: its rows as a table and the summary sentence after it, or —
 * when there is nothing to list — the empty state alone, which says what is
 * true and may name the one next step. A column whose rows all hold one value
 * leaves the table and its stated form joins the summary, after `summary` and
 * before `summaryTail`.
 */
export const inventoryDoc = <T>(options: {
  readonly rows: ReadonlyArray<T>;
  readonly columns: ReadonlyArray<ViewColumn<T>>;
  /** One sentence, or several parts the painter joins with its separator. */
  readonly summary?: string | ReadonlyArray<Text>;
  /** Parts after the uniform columns' facts, such as what needs attention. */
  readonly summaryTail?: ReadonlyArray<Text>;
  readonly mark?: ViewRowMark<T>;
  readonly empty: string | Doc;
}): Doc => {
  const [first] = options.rows;
  if (first === undefined)
    return typeof options.empty === "string"
      ? [{ _tag: "paragraph", text: options.empty }]
      : options.empty;
  const uniform = options.columns.filter((column) => isUniform(column, options.rows));
  const facts = uniform.flatMap((column) => {
    const fact = column.whenUniform?.(first);
    return fact === undefined ? [] : [fact];
  });
  const tail = options.summaryTail ?? [];
  const summary =
    facts.length === 0 && tail.length === 0
      ? options.summary
      : [
          ...(options.summary === undefined
            ? []
            : typeof options.summary === "string"
              ? [options.summary]
              : options.summary),
          ...facts,
          ...tail,
        ];
  return [
    ...tableDoc(
      options.rows,
      options.columns.filter((column) => !uniform.includes(column)),
      options.mark === undefined ? undefined : { mark: options.mark },
    ),
    ...summaryDoc(summary),
  ];
};
