export { CompanionPackageSchema, type CompanionPackage } from "./companion-package.js";

export {
  PACKAGE_IDENTITY_PURL_DESCRIPTION,
  PackageIdentityPurlSchema,
  type PackageIdentityPurl,
} from "./package-identity-purl.js";

export {
  VersComparatorSchema,
  VersConstraintSchema,
  VersRangeSchema,
  parseVersRange,
  splitVersAtScheme,
  type VersComparator,
  type VersConstraint,
  type VersRange,
} from "./vers-range.js";
