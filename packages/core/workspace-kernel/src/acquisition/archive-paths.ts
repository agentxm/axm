/**
 * Which package files a Registry archive carries: the declared publish
 * boundary as a predicate over archive-relative POSIX paths, shared by the
 * archive builder and by every comparison of a local tree against what a
 * Registry release would contain.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { expandGlob } from "@agentxm/extension-model/unstable/extensions/name-patterns";

/** Whether one archive-relative path survives the declared publish boundary. */
export const isArchivePathIncluded = (
  archivePath: string,
  ignore: ReadonlyArray<string> = [],
): boolean => ignore.every((pattern) => expandGlob(pattern, [archivePath]).length === 0);
