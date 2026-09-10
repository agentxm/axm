import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";

export const SCAFFOLD_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const SCAFFOLD_NAME_MAX_LENGTH = 64;
export const scaffoldNameValidationSuggestion =
  "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)";

export const isValidScaffoldName = (name: string): boolean =>
  name.length > 0 && name.length <= SCAFFOLD_NAME_MAX_LENGTH && SCAFFOLD_NAME_PATTERN.test(name);

export const normalizeScaffoldOwner = (owner: string) =>
  normalizeHandle(owner.startsWith("@") ? owner : `@${owner}`);
