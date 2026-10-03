import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";
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

  fastCheckIt.prop(
    {
      drive: FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
      separator: FastCheck.constantFrom("/", "\\"),
      name: FastCheck.stringMatching(/^[A-Za-z0-9]{1,24}$/),
    },
    { numRuns: 100, seed: 0x41584d },
  )("rejects Windows drive-letter paths", ({ drive, separator, name }) =>
    // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
    Effect.runPromise(
      Effect.gen(function* () {
        const fileName = `${drive}:${separator}${name}.txt`;
        const zip = buildZip([{ fileName, content: textContent("unsafe") }]);
        const error = yield* Effect.flip(validateArchive(zip));
        expect(error.code).toBe("absolute_path");
      }),
    ),
  );

  it.effect("rejects symlink entries", () =>
    Effect.gen(function* () {
      const zip = buildSymlinkZip("link.txt", "/etc/passwd");
      const error = yield* Effect.flip(validateArchive(zip));
      expect(error.code).toBe("symlink_entry");
    }),
  );

  for (const target of [
    "../outside",
    "nested/../../outside",
    "C:outside",
    "\\outside",
    "",
    "bad\0target",
  ]) {
    it.effect(`rejects unsafe link target ${JSON.stringify(target)}`, () =>
      Effect.gen(function* () {
        const error = yield* validateArchive(buildSymlinkZip("link", target)).pipe(Effect.flip);
        expect(error.code).toBe("symlink_entry");
      }),
    );
  }

  it.effect("resolves intermediate links before parent segments", () =>
    Effect.gen(function* () {
      const error = yield* validateArchive(
        buildZip([
          {
            fileName: "nested/root",
            content: textContent(".."),
            externalAttributes: 0o120777 << 16,
          },
          {
            fileName: "escape",
            content: textContent("nested/root/../outside"),
            externalAttributes: 0o120777 << 16,
          },
        ]),
      ).pipe(Effect.flip);
      expect(error.code).toBe("symlink_entry");
    }),
  );

  it.effect("allows repeated finite links and contained dangling targets", () =>
    Effect.gen(function* () {
      const entries = yield* validateArchive(
        buildZip([
          { fileName: "root", content: textContent("."), externalAttributes: 0o120777 << 16 },
          {
            fileName: "repeat",
            content: textContent("root/root/absent"),
            externalAttributes: 0o120777 << 16,
          },
        ]),
      );
      expect(entries).toHaveLength(2);
    }),
  );

  it.effect("rejects invalid UTF-8 link targets", () =>
    Effect.gen(function* () {
      const error = yield* validateArchive(
        buildZip([
          { fileName: "link", content: new Uint8Array([0xff]), externalAttributes: 0o120777 << 16 },
        ]),
      ).pipe(Effect.flip);
      expect(error.code).toBe("symlink_entry");
    }),
  );

  for (const attrs of [0o100644 << 16, 0o120777 << 16]) {
    it.effect(`rejects entries nested under a non-directory (${attrs})`, () =>
      Effect.gen(function* () {
        const error = yield* validateArchive(
          buildZip([
            { fileName: "parent", content: textContent("target"), externalAttributes: attrs },
            { fileName: "parent/child", content: textContent("child") },
          ]),
        ).pipe(Effect.flip);
        expect(error.code).toBe("malformed_archive");
      }),
    );
  }

  for (const name of ["a//b", "a/./b", "a\\b", "bad\0name"]) {
    it.effect(`rejects ambiguous member ${JSON.stringify(name)}`, () =>
      Effect.gen(function* () {
        const error = yield* validateArchive(
          buildZip([{ fileName: name, content: textContent("content") }]),
        ).pipe(Effect.flip);
        expect(error.code).toBe("malformed_archive");
      }),
    );
  }

  it.effect("rejects special files and file/directory aliases", () =>
    Effect.gen(function* () {
      const special = yield* validateArchive(
        buildZip([
          { fileName: "fifo", content: new Uint8Array(), externalAttributes: 0o10644 << 16 },
        ]),
      ).pipe(Effect.flip);
      expect(special.code).toBe("malformed_archive");
      const alias = yield* validateArchive(
        buildZip([
          { fileName: "folder", content: textContent("content") },
          { fileName: "folder/", content: new Uint8Array() },
        ]),
      ).pipe(Effect.flip);
      expect(alias.code).toBe("duplicate_entry");
    }),
  );

  it.effect("bounds link-target decoding before allocating path segments", () =>
    Effect.gen(function* () {
      const error = yield* validateArchive(buildSymlinkZip("link", "a/".repeat(32769))).pipe(
        Effect.flip,
      );
      expect(error.code).toBe("symlink_entry");
      expect(error.message).toContain("65536-byte validation limit");
    }),
  );

  it.effect("allows filenames beginning with two dots when they are not parent segments", () =>
    Effect.gen(function* () {
      const entries = yield* validateArchive(
        buildZip([{ fileName: "src/..metadata", content: textContent("unchanged") }]),
      );
      expect(entries[0]?.fileName).toBe("src/..metadata");
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
