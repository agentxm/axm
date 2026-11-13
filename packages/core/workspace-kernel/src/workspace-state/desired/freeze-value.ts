import * as Predicate from "effect/Predicate";

/** Protect owned decoded records and graph payloads before sharing them. */
export const freezeWorkspaceValue = <A>(value: A, visited = new WeakSet<object>()): A => {
  if (Predicate.isObjectOrArray(value) && !visited.has(value) && !Object.isFrozen(value)) {
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      // Freezing these objects does not prevent their setters from changing
      // internal state. Keep the owned scalar and expose independent values.
      if (child instanceof URL) {
        const href = child.href;
        Object.defineProperty(value, key, { enumerable: true, get: () => new URL(href) });
      } else if (child instanceof Date) {
        const instant = structuredClone(child);
        Object.defineProperty(value, key, {
          enumerable: true,
          get: () => structuredClone(instant),
        });
      } else freezeWorkspaceValue(child, visited);
    }
    Object.freeze(value);
  }
  return value;
};
