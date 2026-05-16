import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PackFileAccessor } from "../../context.js";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import { readManifestJson } from "./manifest-json.js";

const encoder = new TextEncoder();

const makeAccessor = (files: Readonly<Record<string, string>>): PackFileAccessor => ({
  exists: (path) => Effect.succeed(Object.hasOwn(files, path)),
  readBytes: (path) => {
    const value = files[path];
    if (value === undefined) {
      return Effect.fail({
        _tag: "FileAccessError" as const,
        path,
        reason: "read-error" as const,
        message: "missing",
      });
    }
    return Effect.succeed(encoder.encode(value));
  },
});

describe("readManifestJson", () => {
  it.effect("returns undefined when the manifest is absent", () =>
    Effect.gen(function* () {
      const value = yield* readManifestJson(makeAccessor({}), "pack.json");

      expect(value).toBeUndefined();
    }),
  );

  it.effect("returns raw parsed JSON for a valid manifest", () =>
    Effect.gen(function* () {
      const value = yield* readManifestJson(
        makeAccessor({ "pack.json": '{"owner":"@acme","unknown":true}' }),
        "pack.json",
      );

      expect(value).toEqual({ owner: "@acme", unknown: true });
    }),
  );

  it.effect("returns a parse-failure marker for invalid JSON", () =>
    Effect.gen(function* () {
      const value = yield* readManifestJson(makeAccessor({ "pack.json": "{ nope" }), "pack.json");

      expect(isManifestJsonParseFailure(value)).toBe(true);
    }),
  );

  it.effect("returns non-object JSON values without schema decoding", () =>
    Effect.gen(function* () {
      const value = yield* readManifestJson(makeAccessor({ "pack.json": "true" }), "pack.json");

      expect(value).toBe(true);
    }),
  );
});
