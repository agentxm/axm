/**
 * The owner vocabulary every authored package is created under.
 *
 * Names follow the canonical extension name grammar, which `CreateExtension`
 * checks against `ExtensionNameSchema`; owners normalize to the canonical
 * handle whether or not the author typed the leading `@`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";

export const normalizeScaffoldOwner = (owner: string) =>
  normalizeHandle(owner.startsWith("@") ? owner : `@${owner}`);
