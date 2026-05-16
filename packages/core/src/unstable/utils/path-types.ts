/**
 * Nominal path string types.
 *
 * Use these at module boundaries after a path has been normalized by the
 * Effect `Path` service. Keep raw strings at external input boundaries.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const looksAbsolutePath = (value: string): boolean =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");

const looksEscapingRelativePath = (value: string): boolean =>
  value === "" || value === ".." || value.startsWith("../") || value.startsWith("..\\");

export const AbsolutePathSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      looksAbsolutePath(value) ? undefined : "Expected an absolute path",
    ),
  ),
  Schema.brand("AbsolutePath"),
);
export type AbsolutePath = Schema.Schema.Type<typeof AbsolutePathSchema>;

export const RelativePathSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      looksAbsolutePath(value) || looksEscapingRelativePath(value)
        ? "Expected a relative path that stays within its root"
        : undefined,
    ),
  ),
  Schema.brand("RelativePath"),
);
export type RelativePath = Schema.Schema.Type<typeof RelativePathSchema>;

const decodeAbsolutePath = Schema.decodeUnknownSync(AbsolutePathSchema);
const decodeRelativePath = Schema.decodeUnknownSync(RelativePathSchema);

export const decodeAbsolutePathSync = (value: string): AbsolutePath => decodeAbsolutePath(value);

export const decodeRelativePathSync = (value: string): RelativePath => decodeRelativePath(value);

export const makeAbsolutePath = (path: Path.Path, value: string): AbsolutePath =>
  decodeAbsolutePath(path.resolve(value));

export const makeRelativePath = (path: Path.Path, value: string): Option.Option<RelativePath> => {
  if (path.isAbsolute(value)) return Option.none();
  const normalized = path.normalize(value);
  if (looksEscapingRelativePath(normalized)) return Option.none();
  return Option.some(decodeRelativePath(normalized));
};

export const makeWorkspaceRelativePath = (
  path: Path.Path,
  workspaceRoot: AbsolutePath | string,
  target: string,
): Option.Option<RelativePath> => {
  const root = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(root, target);
  const relative = path.relative(root, resolvedTarget);
  return makeRelativePath(path, relative);
};
