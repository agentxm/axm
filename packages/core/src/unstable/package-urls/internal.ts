import { PackageURL } from "packageurl-js";

export interface ParsedPurlIdentity {
  readonly type: string;
  readonly version: string | undefined;
}

export const parsePurlIdentity = (value: string): ParsedPurlIdentity | string => {
  try {
    const parsed = PackageURL.fromString(value);
    return {
      type: parsed.type,
      version: parsed.version ?? undefined,
    };
  } catch {
    return `Expected valid purl, got: ${value}`;
  }
};
