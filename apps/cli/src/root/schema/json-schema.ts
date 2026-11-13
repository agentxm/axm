/** Offline JSON Schema navigation. References always resolve inside the captured document. */
import * as Predicate from "effect/Predicate";

export type SchemaNode = boolean | Readonly<Record<string, unknown>>;
export type SchemaObject = Readonly<Record<string, unknown>>;

const isSchemaObject = Predicate.isReadonlyObject;

export const schemaNode = (value: unknown): SchemaNode => {
  if (typeof value === "boolean" || isSchemaObject(value)) return value;
  throw new Error("Malformed bundled JSON Schema node");
};

export const schemaObject = (value: unknown): SchemaObject => {
  if (isSchemaObject(value)) return value;
  throw new Error("Malformed bundled JSON Schema object");
};

const schemaList = (value: unknown): ReadonlyArray<SchemaNode> =>
  Array.isArray(value) ? value.map(schemaNode) : [];

const pointerToken = (value: string): string => value.replace(/~1/gu, "/").replace(/~0/gu, "~");
const referenceTarget = (document: SchemaObject, reference: string): SchemaNode => {
  if (reference === "#") return document;
  if (!reference.startsWith("#/")) {
    throw new Error(`Nonlocal bundled schema reference: ${reference}`);
  }
  let target: unknown = document;
  for (const token of reference.slice(2).split("/")) {
    const key = pointerToken(decodeURIComponent(token));
    if (!isSchemaObject(target) || !Object.hasOwn(target, key)) {
      throw new Error(`Unresolved bundled schema reference: ${reference}`);
    }
    target = target[key];
  }
  return schemaNode(target);
};

const annotatedAlternative = (node: SchemaNode, siblings: SchemaObject): SchemaNode =>
  Object.keys(siblings).length === 0
    ? node
    : Object.keys(siblings).every((key) =>
          [
            "title",
            "description",
            "$comment",
            "examples",
            "default",
            "deprecated",
            "readOnly",
            "writeOnly",
          ].includes(key),
        ) && typeof node !== "boolean"
      ? { ...siblings, ...node }
      : { allOf: [node, siblings] };

/** Expand alternatives without merging their properties into an optional-field bag. */
export const schemaAlternatives = (
  node: SchemaNode,
  document: SchemaObject,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<SchemaNode> => {
  if (typeof node === "boolean") return [node];
  const ref = node["$ref"];
  if (typeof ref === "string") {
    if (seen.has(ref)) return [node];
    const next = new Set(seen).add(ref);
    const { $ref: _ref, ...siblings } = node;
    const alternatives = schemaAlternatives(referenceTarget(document, ref), document, next);
    return Object.keys(siblings).length === 0
      ? alternatives
      : alternatives.map((entry) => annotatedAlternative(entry, siblings));
  }
  const alternatives = schemaList(node["anyOf"] ?? node["oneOf"]);
  if (alternatives.length === 0) {
    const intersections = schemaList(node["allOf"]);
    if (intersections.length === 0) return [node];
    let combinations: ReadonlyArray<ReadonlyArray<SchemaNode>> = [[]];
    for (const part of intersections) {
      combinations = combinations.flatMap((combination) =>
        schemaAlternatives(part, document, seen).map((alternative) => [
          ...combination,
          alternative,
        ]),
      );
    }
    const { allOf: _allOf, ...siblings } = node;
    return combinations.map((parts) => ({
      allOf: [...parts, ...(Object.keys(siblings).length === 0 ? [] : [siblings])],
    }));
  }
  const { anyOf: _anyOf, oneOf: _oneOf, ...siblings } = node;
  return alternatives.flatMap((entry) =>
    schemaAlternatives(entry, document, seen).map((alternative) =>
      annotatedAlternative(alternative, siblings),
    ),
  );
};

const schemaMapKeys = new Set([
  "$defs",
  "definitions",
  "properties",
  "patternProperties",
  "dependentSchemas",
]);
const schemaArrayKeys = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const schemaValueKeys = new Set([
  "additionalProperties",
  "unevaluatedProperties",
  "items",
  "contains",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedItems",
  "additionalItems",
]);

/** Visit schema positions only: literal values and examples may themselves contain `$ref`. */
const mapSchema = (
  node: SchemaNode,
  transform: (object: SchemaObject) => SchemaObject,
): SchemaNode => {
  if (typeof node === "boolean") return node;
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (schemaMapKeys.has(key) && isSchemaObject(value)) {
      mapped[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          mapSchema(schemaNode(child), transform),
        ]),
      );
    } else if (schemaArrayKeys.has(key) && Array.isArray(value)) {
      mapped[key] = value.map((child) => mapSchema(schemaNode(child), transform));
    } else if (schemaValueKeys.has(key)) {
      mapped[key] = Array.isArray(value)
        ? value.map((child) => mapSchema(schemaNode(child), transform))
        : mapSchema(schemaNode(value), transform);
    } else mapped[key] = value;
  }
  return transform(mapped);
};

/** A standalone export contains exactly its reference closure; recursion remains a reference. */
export const standaloneSchema = (
  document: SchemaObject,
  selected: SchemaNode,
  annotation: SchemaObject = {},
): SchemaObject => {
  const definitions: Record<string, SchemaNode> = {};
  const pending = new Set<string>();
  const names = new Map<string, string>();
  const rewrite = (node: SchemaNode): SchemaNode =>
    mapSchema(node, (object) => {
      const result: Record<string, unknown> = { ...object };
      // Generated schemas use one root base URI. A nested base would change the
      // meaning of a local pointer and must be resolved at its producer first.
      if (typeof object["$id"] === "string")
        throw new Error("Nested bundled schema base URI is unsupported");
      for (const key of ["$ref", "$dynamicRef", "$recursiveRef"]) {
        const ref = object[key];
        if (typeof ref !== "string") continue;
        referenceTarget(document, ref);
        let name = names.get(ref);
        if (name === undefined) {
          name =
            ref.startsWith("#/$defs/") && !ref.slice(8).includes("/")
              ? pointerToken(ref.slice(8))
              : `reference.${names.size}`;
          while (Object.hasOwn(definitions, name) || [...names.values()].includes(name))
            name += "_";
          names.set(ref, name);
          pending.add(ref);
        }
        result[key] = `#/$defs/${name.replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
      }
      return result;
    });
  const root = rewrite(selected);
  for (const ref of pending) {
    const name = names.get(ref);
    if (name === undefined) throw new Error("Missing bundled reference name");
    const target = referenceTarget(document, ref);
    const clean =
      typeof target === "boolean"
        ? target
        : Object.fromEntries(
            Object.entries(target).filter(
              ([key]) => key !== "$defs" && key !== "$id" && key !== "$schema",
            ),
          );
    definitions[name] = rewrite(clean);
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...(typeof root === "boolean" ? { allOf: [root] } : root),
    ...annotation,
    ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions }),
  };
};

export interface FieldAlternative {
  readonly schema: SchemaNode;
  readonly required: boolean;
  readonly conditions: ReadonlyArray<string>;
}

const ownProperties = (node: SchemaNode): SchemaObject =>
  typeof node !== "boolean" && isSchemaObject(node["properties"]) ? node["properties"] : {};

const discriminants = (node: SchemaNode, prefix: string): ReadonlyArray<string> => [
  ...(typeof node === "boolean"
    ? []
    : schemaList(node["allOf"]).flatMap((part) => discriminants(part, prefix))),
  ...Object.entries(ownProperties(node)).flatMap(([name, value]) => {
    if (!isSchemaObject(value)) return [];
    const enumeration = value["enum"];
    const literal =
      value["const"] ??
      (Array.isArray(enumeration) && enumeration.length === 1 ? enumeration[0] : undefined);
    return literal === undefined ? [] : [`${prefix}${name} = ${JSON.stringify(literal)}`];
  }),
];

const declaredProperty = (
  node: SchemaNode,
  name: string,
  document: SchemaObject,
): ReadonlyArray<FieldAlternative> => {
  if (typeof node === "boolean") return [];
  const own = ownProperties(node)[name];
  const required = Array.isArray(node["required"]) && node["required"].includes(name);
  const intersections = schemaList(node["allOf"]).flatMap((entry) =>
    schemaAlternatives(entry, document).flatMap((part) => declaredProperty(part, name, document)),
  );
  const found =
    own === undefined
      ? intersections
      : [{ schema: schemaNode(own), required, conditions: [] }, ...intersections];
  if (found.length < 2) return found;
  return [
    {
      schema: { allOf: found.map((entry) => entry.schema) },
      required: found.some((entry) => entry.required),
      conditions: found.flatMap((entry) => entry.conditions),
    },
  ];
};

export const declaredFields = (node: SchemaNode, document: SchemaObject): ReadonlyArray<string> =>
  [
    ...new Set(
      schemaAlternatives(node, document).flatMap((entry): ReadonlyArray<string> =>
        typeof entry === "boolean"
          ? []
          : [
              ...Object.keys(ownProperties(entry)),
              ...schemaList(entry["allOf"]).flatMap((part) => declaredFields(part, document)),
            ],
      ),
    ),
  ].sort();

export const lookupField = (
  root: SchemaNode,
  document: SchemaObject,
  path: string,
): {
  readonly alternatives: ReadonlyArray<FieldAlternative>;
  readonly nearby: ReadonlyArray<string>;
} => {
  if (!/^[\w$-]+(?:\[\])*(?:\.[\w$-]+(?:\[\])*)*$/u.test(path))
    return { alternatives: [], nearby: declaredFields(root, document).slice(0, 8) };
  let current: ReadonlyArray<FieldAlternative> = [{ schema: root, required: true, conditions: [] }];
  let prefix = "";
  for (const segment of path.split(".")) {
    const name = segment.replace(/(?:\[\])+$/u, "");
    const arrays = (segment.length - name.length) / 2;
    const expanded = current.flatMap((entry) =>
      schemaAlternatives(entry.schema, document).map((schema) => ({ ...entry, schema })),
    );
    const nearby = [...new Set(expanded.flatMap((entry) => declaredFields(entry.schema, document)))]
      .sort()
      .slice(0, 8)
      .map((field) => `${prefix}${field}`);
    current = expanded.flatMap((entry) =>
      declaredProperty(entry.schema, name, document).map((property) => ({
        schema: property.schema,
        required: entry.required && property.required,
        conditions: [...entry.conditions, ...discriminants(entry.schema, prefix)],
      })),
    );
    if (current.length === 0) return { alternatives: [], nearby };
    for (let index = 0; index < arrays; index++) {
      current = current.flatMap((entry) =>
        schemaAlternatives(entry.schema, document).flatMap((schema) => {
          if (typeof schema === "boolean") return [];
          const items = schema["items"];
          return items === undefined || Array.isArray(items)
            ? []
            : [{ ...entry, schema: schemaNode(items) }];
        }),
      );
      if (current.length === 0) return { alternatives: [], nearby: [`${prefix}${name}`] };
    }
    prefix += `${segment}.`;
  }
  return { alternatives: current, nearby: [] };
};

export const describeSchema = (node: SchemaNode, document: SchemaObject): string => {
  const alternatives = schemaAlternatives(node, document);
  return [
    ...new Set(
      alternatives.map((entry): string => {
        if (entry === true) return "any JSON value";
        if (entry === false) return "no permitted value";
        if (entry["const"] !== undefined) return JSON.stringify(entry["const"]);
        if (Array.isArray(entry["enum"]))
          return entry["enum"].map((value) => JSON.stringify(value)).join(" | ");
        if (Array.isArray(entry["allOf"]))
          return schemaList(entry["allOf"])
            .map((part) => describeSchema(part, document))
            .join(" and ");
        const type = entry["type"];
        const description =
          typeof entry["description"] === "string" ? ` — ${entry["description"]}` : "";
        const map =
          isSchemaObject(entry["additionalProperties"]) ||
          isSchemaObject(entry["patternProperties"])
            ? "; dynamic map keys"
            : "";
        return `${Array.isArray(type) ? type.join(" | ") : typeof type === "string" ? type : typeof entry["$ref"] === "string" ? "recursive value" : "JSON value"}${map}${description}`;
      }),
    ),
  ].join(" | ");
};
