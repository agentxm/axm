import * as Schema from "effect/Schema";

import {
  extensionTypePluralSegments,
  extensionTypes,
  isExtensionTypePlural,
  toExtensionType,
  toExtensionTypePlural,
  type ExtensionType,
  type ExtensionTypePlural,
} from "./common.js";

export const installableExtensionTypes = extensionTypes;

export type InstallableExtensionType = ExtensionType;

const installableExtensionTypeSet = new Set<string>(installableExtensionTypes);

export const isInstallableExtensionType = (
  value: ExtensionType,
): value is InstallableExtensionType => installableExtensionTypeSet.has(value);

export const installableExtensionTypePluralSegments = extensionTypePluralSegments;

export type InstallableExtensionTypePlural = ExtensionTypePlural;

export const isInstallableExtensionTypePlural = (
  value: string | undefined,
): value is InstallableExtensionTypePlural => isExtensionTypePlural(value);

export const toInstallableExtensionType = (
  segment: InstallableExtensionTypePlural,
): InstallableExtensionType => toExtensionType(segment);

export const toInstallableExtensionTypePlural = (
  type: InstallableExtensionType,
): InstallableExtensionTypePlural => toExtensionTypePlural(type);

export const InstallableExtensionTypeSchema = Schema.Literals(installableExtensionTypes).annotate({
  identifier: "InstallableExtensionType",
  title: "Installable Extension Type",
  description: "Extension types supported by install-oriented CLI and registry flows.",
});

export const InstallableExtensionTypePluralSchema = Schema.Literals(
  installableExtensionTypePluralSegments,
).annotate({
  identifier: "InstallableExtensionTypePlural",
  title: "Installable Extension Type (Plural)",
  description:
    "Plural extension type segments supported by install-oriented CLI and registry flows.",
});
