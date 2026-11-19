import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The gallery is where a design is reviewed, so a view no fixture paints is
 * a view nobody reviews. Every view module under `root/` — a `view.ts` or a
 * `*-view.ts` — is imported by a gallery fixture module or a gallery sample,
 * or is named here with the reason it is not yet.
 */
const awaitingSamples: Readonly<Record<string, string>> = {
  "root/inventory-view.ts": "holds inventory helpers that list views compose",
};

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const walk = (directory: string): ReadonlyArray<string> =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__generated__" ? [] : walk(full);
    return entry.isFile() ? [full] : [];
  });

const files = walk(srcRoot);
const relative = (file: string): string => path.relative(srcRoot, file).split(path.sep).join("/");

const views = files
  .map(relative)
  .filter((file) => file.startsWith("root/") && /(^|\/)(view|[a-z-]+-view)\.ts$/u.test(file));

const galleryModules = files.filter(
  (file) =>
    file.endsWith(".gallery.ts") || relative(file).startsWith("test-support/gallery/samples/"),
);

const importedViews = new Set(
  galleryModules.flatMap((file) =>
    [...fs.readFileSync(file, "utf8").matchAll(/from "(\.[^"]+)\.js"/gu)].flatMap((match) => {
      const specifier = match[1];
      return specifier === undefined
        ? []
        : [relative(path.resolve(path.dirname(file), `${specifier}.ts`))];
    }),
  ),
);

describe("gallery coverage", () => {
  it("paints every view module, or names why it does not yet", () => {
    const unreviewed = views.filter(
      (view) => !importedViews.has(view) && !(view in awaitingSamples),
    );
    expect(unreviewed).toEqual([]);
  });

  it("names no exemption a fixture already covers or that no longer exists", () => {
    const stale = Object.keys(awaitingSamples).filter(
      (view) => importedViews.has(view) || !views.includes(view),
    );
    expect(stale).toEqual([]);
  });
});
