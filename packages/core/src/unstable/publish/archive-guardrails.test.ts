import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { parseZipCentralDirectory, validateArchive } from "./archive-guardrails.js";
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
          fileName: "axm-skill.json",
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
});
