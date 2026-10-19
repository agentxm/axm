import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";
import { crc32 } from "node:zlib";
import {
  checkForbiddenSourceEntries,
  defaultReadEntry,
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

// Fixed ZIP v1 record offsets used to forge archives that a writer would not produce.
const EOCD_SIZE = 22;
const EOCD = {
  diskNumber: 4,
  cdirDisk: 6,
  entriesOnDisk: 8,
  totalEntries: 10,
  cdirSize: 12,
  cdirOffset: 16,
  commentLength: 20,
} as const;
const CENTRAL = { flags: 8, compressedSize: 20, localHeaderOffset: 42 } as const;
const LOCAL = { flags: 6, compressionMethod: 8, fileName: 30 } as const;

interface ZipLayout {
  readonly view: DataView;
  readonly eocd: number;
  readonly cdir: number;
}

const helloContent = textContent("hello world");
const helloZip = () => buildZip([{ fileName: "hello.txt", content: helloContent }]);

const forge = (edit: (layout: ZipLayout) => void, fileNames: readonly string[] = ["hello.txt"]) => {
  const zip = buildZip(fileNames.map((fileName) => ({ fileName, content: helloContent })));
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - EOCD_SIZE;
  edit({ view, eocd, cdir: view.getUint32(eocd + EOCD.cdirOffset, true) });
  return zip;
};

const concat = (...parts: readonly Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

/** Give the end record a comment, which may itself hold a forged end record. */
const withComment = (zip: Uint8Array, comment: Uint8Array) => {
  const commented = concat(zip, comment);
  new DataView(commented.buffer).setUint16(
    zip.length - EOCD_SIZE + EOCD.commentLength,
    comment.length,
    true,
  );
  return commented;
};

const expectMalformed = (zip: Uint8Array, message: RegExp) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(parseZipCentralDirectory(zip));
    expect(error.code).toBe("malformed_archive");
    expect(error.message).toMatch(message);
  });

describe("parseZipCentralDirectory", () => {
  it.effect("parses a valid ZIP and locates each entry's verified data", () =>
    Effect.gen(function* () {
      const deflated = textContent("deflated ".repeat(64));
      const zip = buildZip([
        { fileName: "hello.txt", content: helloContent },
        { fileName: "dir/deflated.txt", content: deflated, compressionMethod: 8 },
      ]);
      const entries = yield* parseZipCentralDirectory(zip);

      expect(entries.map(({ fileName }) => fileName)).toEqual(["hello.txt", "dir/deflated.txt"]);
      const [stored, compressed] = entries;
      expect(stored).toMatchObject({
        versionMadeBy: 20,
        crc32: crc32(helloContent),
        uncompressedSize: 11,
        localHeaderOffset: 0,
        localDataOffset: LOCAL.fileName + "hello.txt".length,
      });
      expect(compressed?.crc32).toBe(crc32(deflated));
      if (stored === undefined || compressed === undefined) return;
      expect(zip.subarray(stored.localDataOffset, stored.localDataOffset + 11)).toEqual(
        helloContent,
      );
      expect(yield* defaultReadEntry(zip, compressed)).toEqual(deflated);
    }),
  );

  it.effect("accepts an archive comment", () =>
    Effect.gen(function* () {
      const zip = withComment(helloZip(), textContent("note"));
      expect(yield* parseZipCentralDirectory(zip)).toHaveLength(1);
    }),
  );

  it.effect("rejects malformed content", () => expectMalformed(buildMalformedZip(), /too small/));

  it.effect("rejects trailing bytes after the end-of-central-directory record", () =>
    expectMalformed(concat(helloZip(), new Uint8Array([0])), /not found at the archive end/),
  );

  it.effect("rejects an end record whose comment length overruns the archive", () =>
    expectMalformed(
      forge(({ view, eocd }) => view.setUint16(eocd + EOCD.commentLength, 1, true)),
      /not found at the archive end/,
    ),
  );

  it.effect("rejects a second end record hidden in the archive comment", () => {
    const zip = helloZip();
    return expectMalformed(withComment(zip, zip.slice(zip.length - EOCD_SIZE)), /more than one/);
  });

  for (const [field, value] of [
    ["diskNumber", 1],
    ["cdirDisk", 1],
    ["entriesOnDisk", 2],
  ] as const) {
    it.effect(`rejects a multi-disk archive (${field})`, () =>
      expectMalformed(
        forge(({ view, eocd }) => view.setUint16(eocd + EOCD[field], value, true)),
        /Multi-disk/,
      ),
    );
  }

  it.effect("rejects a ZIP64 entry-count sentinel", () =>
    expectMalformed(
      forge(({ view, eocd }) => {
        view.setUint16(eocd + EOCD.entriesOnDisk, 0xffff, true);
        view.setUint16(eocd + EOCD.totalEntries, 0xffff, true);
      }),
      /ZIP64 archives/,
    ),
  );

  for (const field of ["cdirSize", "cdirOffset"] as const) {
    it.effect(`rejects a ZIP64 central directory sentinel (${field})`, () =>
      expectMalformed(
        forge(({ view, eocd }) => view.setUint32(eocd + EOCD[field], 0xffffffff, true)),
        /ZIP64 archives/,
      ),
    );
  }

  for (const field of ["compressedSize", "localHeaderOffset"] as const) {
    it.effect(`rejects a ZIP64 entry sentinel (${field})`, () =>
      expectMalformed(
        forge(({ view, cdir }) => view.setUint32(cdir + CENTRAL[field], 0xffffffff, true)),
        /ZIP64 entries/,
      ),
    );
  }

  it.effect("rejects a central directory that does not end at the end record", () => {
    const zip = helloZip();
    const gap = concat(
      zip.subarray(0, zip.length - EOCD_SIZE),
      new Uint8Array(4),
      zip.subarray(zip.length - EOCD_SIZE),
    );
    return expectMalformed(gap, /does not end at the end-of-central-directory/);
  });

  it.effect("rejects an end record that declares more entries than the directory holds", () =>
    expectMalformed(
      forge(({ view, eocd }) => {
        view.setUint16(eocd + EOCD.entriesOnDisk, 2, true);
        view.setUint16(eocd + EOCD.totalEntries, 2, true);
      }),
      /holds 1 entries, but the archive declares 2/,
    ),
  );

  it.effect("rejects an end record that declares fewer entries than the directory holds", () =>
    expectMalformed(
      forge(
        ({ view, eocd }) => {
          view.setUint16(eocd + EOCD.entriesOnDisk, 1, true);
          view.setUint16(eocd + EOCD.totalEntries, 1, true);
        },
        ["a.txt", "b.txt"],
      ),
      /holds 2 entries, but the archive declares 1/,
    ),
  );

  it.effect("rejects an entry flagged encrypted in the central directory", () =>
    expectMalformed(
      forge(({ view, cdir }) => view.setUint16(cdir + CENTRAL.flags, 1, true)),
      /Encrypted/,
    ),
  );

  it.effect("rejects an entry flagged encrypted in its local header", () =>
    expectMalformed(
      forge(({ view }) => view.setUint16(LOCAL.flags, 1, true)),
      /Encrypted/,
    ),
  );

  it.effect("rejects a central entry that points at no local header", () =>
    expectMalformed(
      forge(({ view, cdir }) => view.setUint32(cdir + CENTRAL.localHeaderOffset, 1, true)),
      /Invalid local file header/,
    ),
  );

  it.effect("rejects local and central file names that disagree", () =>
    expectMalformed(
      forge(({ view }) => view.setUint8(LOCAL.fileName, "j".charCodeAt(0))),
      /file names disagree/,
    ),
  );

  it.effect("rejects local and central compression methods that disagree", () =>
    expectMalformed(
      forge(({ view }) => view.setUint16(LOCAL.compressionMethod, 8, true)),
      /compression methods disagree/,
    ),
  );

  it.effect("rejects entry data that overlaps the central directory", () =>
    expectMalformed(
      forge(({ view, cdir }) => view.setUint32(cdir + CENTRAL.compressedSize, 12, true)),
      /exceeds archive bounds/,
    ),
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
