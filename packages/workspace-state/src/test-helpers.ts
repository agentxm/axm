import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(message ?? `Expected element at index ${index}`);
  }
  return value;
};

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);
