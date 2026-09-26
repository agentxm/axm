/**
 * The name and owner vocabulary every authored package is created under.
 *
 * One pattern, one length bound, one owner normalization for all seven
 * extension types: the name an author types becomes a directory name, a
 * settings key, and a Registry package name, so a type that accepted a
 * different shape would author packages the rest of the system cannot name.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";

export const SCAFFOLD_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const SCAFFOLD_NAME_MAX_LENGTH = 64;

export const isValidScaffoldName = (name: string): boolean =>
  name.length > 0 && name.length <= SCAFFOLD_NAME_MAX_LENGTH && SCAFFOLD_NAME_PATTERN.test(name);

export const normalizeScaffoldOwner = (owner: string) =>
  normalizeHandle(owner.startsWith("@") ? owner : `@${owner}`);
