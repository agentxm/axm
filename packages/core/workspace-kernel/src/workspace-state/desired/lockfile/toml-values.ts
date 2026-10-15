import { parseTOML, type AST } from "toml-eslint-parser";
import * as Data from "effect/Data";

/** Valid TOML whose value is outside the lockfile's value contract. */
export class LockfileTomlValueError extends Data.TaggedError("LockfileTomlValueError")<{
  readonly detail: string;
}> {}
const invalidValue = (detail: string) => new LockfileTomlValueError({ detail });

type Scalar =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "integer" | "float"; readonly value: string }
  | {
      readonly kind: "offset-date-time" | "local-date-time" | "local-date" | "local-time";
      readonly value: string;
    };

/** Opaque TOML values retain kind and precision independently of the resolution view. */
export type ToolValue =
  Scalar | ToolTable | { readonly kind: "array"; readonly values: ReadonlyArray<ToolValue> };
export interface ToolTable {
  readonly kind: "table";
  readonly entries: ReadonlyMap<string, ToolValue>;
}
export type ToolTables = ReadonlyMap<string, ToolTable>;

type MutableValue = Scalar | MutableTable | { kind: "array"; values: MutableValue[] };
interface MutableTable {
  kind: "table";
  entries: Map<string, MutableValue>;
}

const table = (): MutableTable => ({ kind: "table", entries: new Map() });

const child = (value: MutableValue, key: string | number): MutableValue | undefined => {
  if (value.kind === "table" && typeof key === "string") return value.entries.get(key);
  if (value.kind === "array" && typeof key === "number") return value.values[key];
  throw new Error("Invalid TOML container path");
};

const setChild = (value: MutableValue, key: string | number, next: MutableValue): void => {
  if (value.kind === "table" && typeof key === "string") value.entries.set(key, next);
  else if (value.kind === "array" && typeof key === "number") value.values[key] = next;
  else throw new Error("Invalid TOML container path");
};

/** Resolved AST paths include array-table indices; no string splitting or inherited lookup. */
const parentAt = (root: MutableTable, path: ReadonlyArray<string | number>): MutableValue => {
  let current: MutableValue = root;
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index];
    if (key === undefined) throw new Error("Missing TOML path segment");
    let next = child(current, key);
    if (next === undefined) {
      next = typeof path[index + 1] === "number" ? { kind: "array", values: [] } : table();
      setChild(current, key, next);
    }
    current = next;
  }
  return current;
};

const tableAt = (root: MutableTable, path: ReadonlyArray<string | number>): MutableTable => {
  const key = path.at(-1);
  if (key === undefined) return root;
  const parent = parentAt(root, path);
  const existing = child(parent, key);
  if (existing?.kind === "table") return existing;
  if (existing !== undefined) throw new Error("Expected a TOML table");
  const result = table();
  setChild(parent, key, result);
  return result;
};

const floatLiteral = (node: AST.TOMLFloatValue): string => {
  const value = node.value;
  if (Number.isNaN(value)) return "nan";
  if (!Number.isFinite(value)) {
    if (!/^[+-]?inf$/u.test(node.number)) throw invalidValue("TOML float overflows binary64");
    return value < 0 ? "-inf" : "inf";
  }
  if (value === 0 && /[1-9]/u.test(node.number.split(/[eE]/u)[0] ?? ""))
    throw invalidValue("TOML float underflows binary64");
  if (Object.is(value, -0)) return "-0.0";
  const text = String(value);
  return /[.e]/u.test(text) ? text : `${text}.0`;
};

const scalar = (node: AST.TOMLValue): Scalar => {
  switch (node.kind) {
    case "string":
      return { kind: "string", value: node.value };
    case "boolean":
      return { kind: "boolean", value: node.value };
    case "integer":
      if (node.bigint < -(2n ** 63n) || node.bigint > 2n ** 63n - 1n)
        throw invalidValue("TOML integer is outside the signed 64-bit range");
      return { kind: "integer", value: node.bigint.toString() };
    case "float":
      return { kind: "float", value: floatLiteral(node) };
    default:
      return { kind: node.kind, value: node.datetime.replace(/[t ]/u, "T").replace(/z$/u, "Z") };
  }
};

const valueOf = (node: AST.TOMLContentNode): MutableValue => {
  if (node.type === "TOMLValue") return scalar(node);
  if (node.type === "TOMLArray") return { kind: "array", values: node.elements.map(valueOf) };
  const result = table();
  for (const entry of node.body) addEntry(result, entry);
  return result;
};

const addEntry = (target: MutableTable, entry: AST.TOMLKeyValue): void => {
  const keys = entry.key.keys.map((key) => (key.type === "TOMLBare" ? key.name : key.value));
  const key = keys.at(-1);
  if (key === undefined) throw new Error("Missing TOML key");
  try {
    setChild(parentAt(target, keys), key, valueOf(entry.value));
  } catch (cause) {
    if (cause instanceof LockfileTomlValueError)
      throw invalidValue(
        `${cause.detail} at ${entry.loc.start.line}:${entry.loc.start.column + 1}`,
      );
    throw cause;
  }
};

/** Only AXM-owned integer fields cross into JS numbers; tool values never do. */
const ownedValue = (value: ToolValue, path: ReadonlyArray<string | number>): unknown => {
  switch (value.kind) {
    case "table":
      return Object.fromEntries(
        [...value.entries].map(([key, item]) => [key, ownedValue(item, [...path, key])]),
      );
    case "array":
      return value.values.map((item, index) => ownedValue(item, [...path, index]));
    case "string":
    case "boolean":
      return value.value;
    case "integer": {
      const number = Number(value.value);
      if (Number.isSafeInteger(number)) return number;
      throw invalidValue(`AXM integer must be exactly representable at ${JSON.stringify(path)}`);
    }
    default:
      throw invalidValue(
        `TOML ${value.kind} is only allowed under tool at ${JSON.stringify(path)}`,
      );
  }
};

export interface ParsedLockfileToml {
  readonly document: Record<string, unknown>;
  readonly tool: ToolTables | undefined;
}

/** One syntax boundary, with a separate lossless carrier for tool-owned values. */
export const parseLockfileToml = (raw: string): ParsedLockfileToml => {
  const ast = parseTOML(raw, { tomlVersion: "1.0.0" });
  const root = table();
  for (const node of ast.body[0].body) {
    if (node.type === "TOMLKeyValue") addEntry(root, node);
    else {
      const target = tableAt(root, node.resolvedKey);
      for (const entry of node.body) addEntry(target, entry);
    }
  }
  const tool = root.entries.get("tool");
  let namespaces: Map<string, ToolTable> | undefined;
  if (tool !== undefined) {
    if (tool.kind !== "table") throw invalidValue("Expected tool to be a table");
    namespaces = new Map();
    for (const [name, value] of tool.entries) {
      if (value.kind !== "table")
        throw invalidValue(`Expected tool.${JSON.stringify(name)} to be a table`);
      namespaces.set(name, value);
    }
    root.entries.delete("tool");
  }
  return {
    document: Object.fromEntries(
      [...root.entries].map(([key, value]) => [key, ownedValue(value, [key])]),
    ),
    tool: namespaces,
  };
};
