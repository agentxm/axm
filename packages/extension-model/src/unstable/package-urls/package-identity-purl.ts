import * as Schema from "effect/Schema";
import { parsePurlIdentity } from "./internal.js";

export const PACKAGE_IDENTITY_PURL_DESCRIPTION =
  "A Package URL (purl) identity for a companion package. Companion package purls are identities, not pins: omit the purl @version segment and put compatibility constraints in versionRange.";

const PACKAGE_URL_PATTERN = /^[Pp][Kk][Gg]:[a-zA-Z][a-zA-Z0-9.+-]*\/.+$/;

const validatePackageIdentityPurl = (value: string): string | undefined => {
  const parsed = parsePurlIdentity(value);
  if (typeof parsed === "string") {
    return `Expected valid companion package purl, got: ${value}`;
  }

  return parsed.version === undefined
    ? undefined
    : `Companion package purls are identities, not pins. Move ${value}'s version into versionRange.`;
};

export const PackageIdentityPurlSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.isPattern(PACKAGE_URL_PATTERN, {
      title: "Package Identity Purl",
      description: PACKAGE_IDENTITY_PURL_DESCRIPTION,
      examples: ["pkg:npm/react", "pkg:pypi/requests", "pkg:cargo/serde"],
      message: "Expected a Package URL like pkg:npm/react",
    }),
  ),
  Schema.check(Schema.makeFilter(validatePackageIdentityPurl)),
  Schema.annotate({
    identifier: "PackageIdentityPurl",
    title: "Package Identity Purl",
    description: PACKAGE_IDENTITY_PURL_DESCRIPTION,
    examples: ["pkg:npm/react", "pkg:pypi/requests", "pkg:cargo/serde"],
    message: "Companion package purls are identities, not pins. Use versionRange for versions.",
  }),
  Schema.brand("PackageIdentityPurl"),
);

export type PackageIdentityPurl = Schema.Schema.Type<typeof PackageIdentityPurlSchema>;
