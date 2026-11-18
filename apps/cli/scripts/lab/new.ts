/**
 * Start a gallery fixture beside the view it exercises.
 *
 * `lab new <view>` writes `<view>.gallery.ts` next to a view module under the
 * CLI's sources: a fixture that already imports the view and the sample-data
 * builders, holding a placeholder document until the view is called with
 * sample data. Discovery finds it by its name, so nothing registers it.
 */

import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { userError } from "./shared.js";

const template = (spec: {
  readonly fixtureName: string;
  readonly viewModule: string;
  readonly toGallery: string;
  readonly toScreen: string;
}) => `// Paint ${spec.viewModule} with sample data: call one of its view functions
// with records built from ${spec.toGallery}/samples/builders.js, and give the
// fixture the name its snapshots will carry.
import type { Doc } from "${spec.toScreen}/doc.js";
import { galleryModule } from "${spec.toGallery}/fixture.js";

/** What this scenario shows, and why a reader would look at it. */
const doc: Doc = [
  { _tag: "headline", tone: "warn", text: "${spec.fixtureName} is a placeholder" },
  { _tag: "paragraph", text: "Replace this document with ${spec.viewModule} painting sample data." },
];

export default galleryModule({ _tag: "document", name: "${spec.fixtureName}", doc });
`;

/** Where a relative import from `from` reaches `to`, as an import specifier. */
const specifier = (path: Path.Path, from: string, to: string): string => {
  const relative = path.relative(from, to).split(path.sep).join("/");
  return relative.startsWith(".") ? relative : `./${relative}`;
};

export const newFixture = (viewPath: string, name: string | undefined) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceRoot = yield* path.fromFileUrl(new URL("../../src/", import.meta.url));
    const view = path.resolve(viewPath);
    if (!view.startsWith(sourceRoot) || !view.endsWith(".ts") || view.endsWith(".gallery.ts"))
      return yield* userError(
        `Name a view module under ${sourceRoot}, such as apps/cli/src/root/list/view.ts.`,
      );
    if (!(yield* fs.exists(view))) return yield* userError(`${viewPath} does not exist.`);
    const target = view.replace(/\.ts$/u, ".gallery.ts");
    if (yield* fs.exists(target))
      return yield* userError(`${path.relative(process.cwd(), target)} already exists.`);
    const directory = path.dirname(view);
    const module = path.basename(view, ".ts").replace(/-?view$/u, "");
    const fixtureName =
      name ?? `${path.basename(directory)}--${module.length === 0 ? "sample" : module}`;
    yield* fs.writeFileString(
      target,
      template({
        fixtureName,
        viewModule: `./${path.basename(view, ".ts")}.js`,
        toGallery: specifier(path, directory, path.join(sourceRoot, "test-support/gallery")),
        toScreen: specifier(path, directory, path.join(sourceRoot, "screen")),
      }),
    );
    const shown = path.relative(process.cwd(), target);
    yield* Console.log(`Wrote ${shown}, fixture ${fixtureName}.`);
    yield* Console.log(`  pnpm lab view ${fixtureName} --watch   look at it while you edit`);
    yield* Console.log(`  pnpm lab accept ${fixtureName}         record its snapshots`);
  });
