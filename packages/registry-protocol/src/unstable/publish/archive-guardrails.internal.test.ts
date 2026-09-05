import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import {
  checkForbiddenSourceEntries,
  parseZipCentralDirectory,
  validateArchive,
} from "./archive-guardrails.js";
import {
  buildDecompressionBombZip,
  buildMalformedZip,
  buildSymlinkZip,
  buildZip,
  textContent,
} from "./test-zip-helpers.js";

describe("parseZipCentralDirectory", () => {
  it.effect("parses a valid ZIP with one entry", () =>
    Effect.gen(function* () {
      const zip = buildZip([{ fileName: "hello.txt", content: textContent("hello world") }]);
      const entries = yield* parseZipCentralDirectory(zip);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.fileName).toBe("hello.txt");
      expect(entries[0]?.uncompressedSize).toBe(11);
    }),
  );

  it.effect("rejects malformed content", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseZipCentralDirectory(buildMalformedZip()));
      expect(error.code).toBe("malformed_archive");
    }),
  );
});

describe("validateArchive", () => {
  it.effect("accepts a valid archive", () =>
    Effect.gen(function* () {
      const zip = buildZip([
        {
          fileName: "skill.json",
          content: textContent('{"name":"test","version":"1.0.0"}'),
        },
        { fileName: "index.js", content: textContent("module.exports = {}") },
      ]);

      const entries = yield* validateArchive(zip);
      expect(entries).toHaveLength(2);
    }),
  );

  it.effect("rejects path traversal entries", () =>
    Effect.gen(function* () {
      const zip = buildZip([{ fileName: "../escape.txt", content: textContent("escaped") }]);
      const error = yield* Effect.flip(validateArchive(zip));
      expect(error.code).toBe("path_traversal");
    }),
  );

  it.effect("rejects duplicate entries", () =>
    Effect.gen(function* () {
      const zip = buildZip([
        { fileName: "README.md", content: textContent("first") },
        { fileName: "readme.md", content: textContent("second") },
      ]);
      const error = yield* Effect.flip(validateArchive(zip));
      expect(error.code).toBe("duplicate_entry");
    }),
  );

  it.effect.prop(
    "rejects Windows drive-letter paths",
    {
      drive: FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
      separator: FastCheck.constantFrom("/", "\\"),
      name: FastCheck.stringMatching(/^[A-Za-z0-9]{1,24}$/),
    },
    ({ drive, separator, name }) =>
      Effect.gen(function* () {
        const fileName = `${drive}:${separator}${name}.txt`;
        const zip = buildZip([{ fileName, content: textContent("unsafe") }]);
        const error = yield* Effect.flip(validateArchive(zip));
        expect(error.code).toBe("absolute_path");
      }),
    { fastCheck: { numRuns: 100, seed: 0x41584d } },
  );

  it.effect("rejects symlink entries", () =>
    Effect.gen(function* () {
      const zip = buildSymlinkZip("link.txt", "/etc/passwd");
      const error = yield* Effect.flip(validateArchive(zip));
      expect(error.code).toBe("symlink_entry");
    }),
  );

  it.effect("rejects compression bombs", () =>
    Effect.gen(function* () {
      const zip = buildDecompressionBombZip(300 * 1024 * 1024, 100);
      const error = yield* Effect.flip(validateArchive(zip));
      expect(["decompression_limit_exceeded", "compression_ratio_exceeded"]).toContain(error.code);
    }),
  );

  it.effect("still accepts build and secret leftovers, keeping registry ingest unchanged", () =>
    Effect.gen(function* () {
      const zip = buildZip([
        { fileName: "skill.json", content: textContent('{"name":"test"}') },
        { fileName: "node_modules/pkg/index.js", content: textContent("module.exports = {}") },
        { fileName: ".env", content: textContent("TOKEN=secret") },
      ]);

      const entries = yield* validateArchive(zip);
      expect(entries).toHaveLength(3);
    }),
  );
});

describe("checkForbiddenSourceEntries", () => {
  const entriesFor = (fileNames: readonly string[]) =>
    parseZipCentralDirectory(
      buildZip(fileNames.map((fileName) => ({ fileName, content: textContent("content") }))),
    );

  it.effect("accepts a clean extension archive", () =>
    Effect.gen(function* () {
      const entries = yield* entriesFor(["skill.json", "src/SKILL.md"]);
      yield* checkForbiddenSourceEntries(entries);
    }),
  );

  it.effect("accepts names that only resemble the deny list", () =>
    Effect.gen(function* () {
      const entries = yield* entriesFor([".envrc", "environment.md", "docs/node_modules.md"]);
      yield* checkForbiddenSourceEntries(entries);
    }),
  );

  for (const fileName of [
    "node_modules/pkg/index.js",
    "src/node_modules/x.js",
    ".git/config",
    ".env",
    ".env.local",
    "conf/.env.production",
  ]) {
    it.effect(`rejects "${fileName}"`, () =>
      Effect.gen(function* () {
        const entries = yield* entriesFor(["skill.json", fileName]);
        const error = yield* Effect.flip(checkForbiddenSourceEntries(entries));

        expect(error.code).toBe("forbidden_entry");
        expect(error.entry).toBe(fileName);
      }),
    );
  }
});
