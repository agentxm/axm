import { PackageURL } from "packageurl-js";

export interface ParsedPurlIdentity {
  readonly type: string;
  readonly version: string | undefined;
}

export const parsePurlIdentity = (value: string): ParsedPurlIdentity | string => {
  try {
    const [type, , , version] = PackageURL.parseString(value);
    if (type === undefined) {
      return `Expected valid purl, got: ${value}`;
    }

    return {
      type: type.toLowerCase(),
      version: version ?? undefined,
    };
  } catch {
    return `Expected valid purl, got: ${value}`;
  }
};
