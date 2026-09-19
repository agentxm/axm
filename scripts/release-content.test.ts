import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPECTED_CONTENT_ASSETS, validateReleaseContentAssets } from "./release-checksums.js";
import { produceReleaseContent, RELEASE_CONTENT_SOURCES } from "./release-content.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release content", () => {
  it("flattens exactly the installers and generated schemas into one immutable cohort", () => {
    const root = mkdtempSync(join(tmpdir(), "axm-release-content-"));
    temporaryDirectories.push(root);
    const source = join(root, "source");
    const output = join(root, "output");
    for (const name of EXPECTED_CONTENT_ASSETS) {
      const path = join(source, RELEASE_CONTENT_SOURCES[name]);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `content:${name}`, "utf8");
    }

    produceReleaseContent(source, output);

    expect(validateReleaseContentAssets(output)).toEqual({ contentCount: 14 });
    for (const name of EXPECTED_CONTENT_ASSETS) {
      expect(readFileSync(join(output, name), "utf8")).toBe(`content:${name}`);
    }

    writeFileSync(join(output, "unexpected.json"), "{}", "utf8");
    expect(() => validateReleaseContentAssets(output)).toThrow(/unexpected\.json/u);
  });
});
