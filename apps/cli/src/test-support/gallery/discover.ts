/**
 * The terminal design gallery, discovered rather than registered: every
 * `*.gallery.ts` module under the CLI's sources default-exports the fixtures
 * it adds. Discovery is a filesystem glob and a dynamic import, which Vitest
 * and Bun both run, so the gallery test and the lab see the same fixtures in
 * the same order.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { GalleryModule, type GalleryFixture } from "./fixture.js";

/** The file name every gallery fixture module carries. */
const galleryModulePattern = "**/*.gallery.ts";

class GalleryDiscoveryFailed extends Data.TaggedError("GalleryDiscoveryFailed")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const GalleryModuleExports = Schema.Struct({ default: Schema.instanceOf(GalleryModule) });
const decodeGalleryModule = Schema.decodeUnknownEffect(GalleryModuleExports);

const importGalleryModule = Effect.fn("Gallery.importModule")(function* (file: string) {
  const path = yield* Path.Path;
  const url = yield* path.toFileUrl(file);
  const exports = yield* Effect.tryPromise({
    try: () => import(/* @vite-ignore */ url.href),
    catch: (cause) => new GalleryDiscoveryFailed({ message: `${file} failed to load`, cause }),
  });
  const module = yield* decodeGalleryModule(exports).pipe(
    Effect.mapError(
      (cause) =>
        new GalleryDiscoveryFailed({
          message: `${file} does not default-export galleryModule(...)`,
          cause,
        }),
    ),
  );
  return module.default.fixtures;
});

/**
 * Every gallery fixture, sorted by name. Discovery fails when it finds no
 * fixture or two fixtures share a name, since a name is a snapshot's identity.
 */
export const discoverGallery = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sourceRoot = yield* path.fromFileUrl(new URL("../../", import.meta.url));
  const files = yield* fs.glob(galleryModulePattern, { root: sourceRoot });
  const modules = yield* Effect.forEach(files, (file) =>
    importGalleryModule(path.join(sourceRoot, file)),
  );
  const fixtures = modules
    .flat()
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  if (fixtures.length === 0) {
    return yield* new GalleryDiscoveryFailed({
      message: `no ${galleryModulePattern} module under ${sourceRoot}`,
    });
  }
  const duplicates = fixtures.filter(
    (fixture, index) => index > 0 && fixtures[index - 1]?.name === fixture.name,
  );
  if (duplicates.length > 0) {
    return yield* new GalleryDiscoveryFailed({
      message: `fixture names must be unique: ${[...new Set(duplicates.map((fixture) => fixture.name))].join(", ")}`,
    });
  }
  return fixtures;
});

/** Discover the gallery on the host file system, for a test module. */
export const loadGallery = (): Promise<ReadonlyArray<GalleryFixture>> =>
  Effect.runPromise(discoverGallery.pipe(Effect.provide(NodeServices.layer)));
