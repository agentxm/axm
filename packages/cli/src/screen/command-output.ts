import type {
  DetailFieldConfig,
  DetailView,
  ResolvedDetailField,
  ResolvedTableColumn,
  TableColumnConfig,
  TableView,
  ViewKey,
} from "./output.js";

const defaultRenderValue = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  return String(value);
};

const typedEntries = <T extends object>(record: T) => {
  // Assertion needed: Object.entries preserves key/value pairs at runtime but loses
  // their relationship in the standard library types.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return Object.entries(record) as unknown as ReadonlyArray<
    {
      readonly [K in Extract<keyof T, string>]: readonly [K, T[K]];
    }[Extract<keyof T, string>]
  >;
};

const resolveTableColumn = <T extends object, K extends ViewKey<T>>(
  key: K,
  config: TableColumnConfig<T, K>,
): ResolvedTableColumn<T> => ({
  key,
  header: config.header,
  render: (row) => {
    const rendered = config.render?.(row[key], row);
    return rendered ?? defaultRenderValue(row[key]);
  },
  align: config.align ?? "left",
  width: config.width ?? "auto",
});

const resolveDetailField = <T extends object, K extends ViewKey<T>>(
  key: K,
  config: DetailFieldConfig<T, K>,
): ResolvedDetailField<T> => ({
  key,
  label: config.label,
  render: (row) => {
    const rendered = config.render?.(row[key], row);
    return rendered ?? defaultRenderValue(row[key]);
  },
});

export const resolveTableColumns = <T extends object>(
  view: TableView<T>,
): ReadonlyArray<ResolvedTableColumn<T>> =>
  typedEntries(view.columns).map(([key, config]) => resolveTableColumn(key, config));

export const resolveDetailFields = <T extends object>(
  view: DetailView<T>,
): ReadonlyArray<ResolvedDetailField<T>> =>
  typedEntries(view.fields).map(([key, config]) => resolveDetailField(key, config));
