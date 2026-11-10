import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export class PackageResourceInvalid extends Schema.TaggedError<PackageResourceInvalid>()(
  "PackageResourceInvalid",
  { reference: Schema.String, detail: Schema.String, cause: Schema.optional(Schema.Unknown) },
) {}

/** Read from the candidate tree, but bind the resource to its retained package. */
export const bindPackageResource = Effect.fn("bindPackageResource")(function* (args: {
  readonly sourceRoot: string;
  readonly retainedRoot: string;
  readonly base: string;
  readonly reference: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const invalid = (detail: string, cause?: unknown) =>
    new PackageResourceInvalid({
      reference: args.reference,
      detail,
      ...(cause === undefined ? {} : { cause }),
    });
  // Package paths are portable: reject Windows roots even on a POSIX host.
  if (
    args.reference.length === 0 ||
    /^(?:[\\/]|~[\\/]|[A-Za-z]:|[a-z]+:\/\/)/u.test(args.reference)
  )
    return yield* invalid("A package resource must use a nonempty relative path.");
  const sourceRoot = yield* fs
    .realPath(args.sourceRoot)
    .pipe(
      Effect.mapError((cause) => invalid("The package resource root cannot be resolved.", cause)),
    );
  const relative = path.join(args.base, args.reference.replaceAll("\\", "/"));
  const candidate = path.resolveWithin(sourceRoot, relative);
  if (Option.isNone(candidate)) return yield* invalid("The resource path escapes its package.");
  const source = yield* fs
    .realPath(candidate.value)
    .pipe(Effect.mapError((cause) => invalid("The package resource cannot be resolved.", cause)));
  const physical = path.resolveWithin(sourceRoot, path.relative(sourceRoot, source));
  if (Option.isNone(physical) || source === sourceRoot)
    return yield* invalid("The resource resolves outside its package.");
  const info = yield* fs
    .stat(source)
    .pipe(Effect.mapError((cause) => invalid("The package resource cannot be inspected.", cause)));
  if (info.type !== "File") return yield* invalid("A package resource must be a regular file.");
  const content = yield* fs
    .readFileString(source)
    .pipe(Effect.mapError((cause) => invalid("The package resource cannot be read.", cause)));
  // A contained symlink may name an absolute source path. Bind its resolved
  // target so the reference still works after the candidate tree is released.
  const relativePath = path.relative(sourceRoot, source);
  return {
    relativePath: relativePath.split(path.sep).join("/"),
    retainedPath: path.resolve(args.retainedRoot, relativePath),
    content,
  };
});
