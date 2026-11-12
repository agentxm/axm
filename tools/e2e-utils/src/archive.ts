import { zipSync, type Zippable } from "fflate";

/** Deterministic stored ZIP for test packages; this performs no production admission. */
export const fixtureArchive = (files: Readonly<Record<string, string>>): Uint8Array => {
  const entries: Zippable = {};
  for (const [name, body] of Object.entries(files)) {
    entries[name] = [new TextEncoder().encode(body), { mtime: "2020-01-01T00:00:00.000Z" }];
  }
  return zipSync(entries, { level: 0 });
};
