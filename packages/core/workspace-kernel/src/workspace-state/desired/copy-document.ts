import * as Predicate from "effect/Predicate";

/** Copy validated document containers, including their decoded URL values. */
export const copyWorkspaceDocument = <A extends object>(document: A): A => {
  const copies = new WeakMap<object, unknown>();
  const copyValue = (value: unknown): unknown => {
    if (!Predicate.isObjectOrArray(value)) return structuredClone(value);
    if (copies.has(value)) return copies.get(value);
    if (value instanceof URL) return new URL(value.href);
    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      copies.set(value, copy);
      for (const item of value) copy.push(copyValue(item));
      return copy;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
      ? copyRecord(value)
      : structuredClone(value);
  };
  const copyRecord = <B extends object>(value: B): B => {
    const copy = { ...value };
    copies.set(value, copy);
    for (const [key, child] of Object.entries(value)) Reflect.set(copy, key, copyValue(child));
    return copy;
  };
  return copyRecord(document);
};
