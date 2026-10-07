/** Stable source-package identity and portable placement conflicts. */
import * as Result from "effect/Result";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  packageSourceForEntry,
  retainedPackageKey,
  type RetainedPackage,
  type Lockfile,
} from "../desired/lockfile/schema.js";
import { lockEntries } from "./entry-accessors.js";
import { acquiredPackageRelativePath } from "./extension-paths.js";
import { extensionPathSourceFromLockEntry } from "./lock-entry.js";
import { decodeSourceSegment, SourceAddressInvalid } from "./source-address.js";

const lockMapNames = {
  skill: "skills",
  subagent: "subagents",
  "mcp-server": "mcpServers",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<InstallableExtensionType, keyof Lockfile>;

export const retainedPackageSourceForRef = (
  ref: Exclude<ExtensionRef, { readonly refType: "workspace" }>,
): RetainedPackage["source"] => {
  if (ref.refType === "registry")
    return {
      type: "registry",
      url: new URL(ref.source.location.href.replace(/\/$/u, "")),
      owner: ref.owner,
      extensionType: lockMapNames[ref.type],
      name: ref.name,
    };
  const format = ref.distribution?.format ?? "native";
  if (ref.refType === "git-hosted")
    return {
      type: "git",
      url: ref.source.url,
      path: ref.distribution?.packageRoot ?? ref.sourcePath ?? ".",
      format,
    };
  if (ref.refType === "http")
    return {
      type: "http",
      url: ref.source.url,
      kind: ref.source.kind,
      ...(ref.source.entry === undefined ? {} : { entry: ref.source.entry }),
      path: ref.distribution?.packageRoot ?? ref.sourcePath,
      portable: ref.portable,
      format,
    };
  const selected = ref.sourcePath ?? ref.source.path;
  const component = ref.distribution?.componentPath;
  const suffix = component === undefined || component === "." ? "" : `/${component}`;
  const root =
    selected === component
      ? "."
      : suffix !== "" && selected.endsWith(suffix)
        ? selected.slice(0, -suffix.length) || "."
        : selected;
  return { type: "path", path: root, format };
};

export const retainedPackageKeyForRef = (
  ref: Exclude<ExtensionRef, { readonly refType: "workspace" }>,
): string => retainedPackageKey(retainedPackageSourceForRef(ref));

/** Every accepted component, including disabled and currently unreached bindings. */
export const retainedPackageBindings = (lockfile: Lockfile) =>
  installableExtensionTypes.flatMap((type) =>
    Object.entries(lockEntries[type].entries(lockfile)).map(([key, entry]) => ({
      type,
      key,
      entry,
      packageKey: retainedPackageKey(packageSourceForEntry(lockMapNames[type], entry)),
    })),
  );

export interface PackageAddressClaim {
  readonly packageKey: string;
  readonly address: string;
}

export const packageAddressClaimForRef = (
  ref: Exclude<ExtensionRef, { readonly refType: "workspace" }>,
): Result.Result<PackageAddressClaim, SourceAddressInvalid> =>
  Result.map(
    acquiredPackageRelativePath(ref, toExtensionTypePlural(ref.type), ref.name),
    (address) => ({ address, packageKey: retainedPackageKeyForRef(ref) }),
  );

export const acceptedPackageAddressClaims = (
  lockfile: Lockfile,
): Result.Result<ReadonlyArray<PackageAddressClaim>, SourceAddressInvalid> => {
  const claims: PackageAddressClaim[] = [];
  for (const binding of retainedPackageBindings(lockfile)) {
    const address = acquiredPackageRelativePath(
      extensionPathSourceFromLockEntry(binding.entry),
      toExtensionTypePlural(binding.type),
      binding.entry.identity.name,
    );
    if (Result.isFailure(address)) return Result.fail(address.failure);
    claims.push({ packageKey: binding.packageKey, address: address.success });
  }
  return Result.succeed(claims);
};

const portableAddress = (address: string): Result.Result<string, SourceAddressInvalid> => {
  const segments: string[] = [];
  for (const [index, segment] of address.split("/").entries()) {
    const decoded =
      index === 0 && segment === "_local" ? Result.succeed(segment) : decodeSourceSegment(segment);
    if (Result.isFailure(decoded)) return decoded;
    segments.push(decoded.success.normalize("NFC").toUpperCase().toLowerCase());
  }
  return Result.succeed(segments.join("/"));
};

/** Refuse aliases and overlapping payload boundaries before a candidate mutates content. */
export const validatePackageAddressClaims = (
  claims: ReadonlyArray<PackageAddressClaim>,
  root = "",
): Result.Result<void, SourceAddressInvalid> => {
  const seen: Array<PackageAddressClaim & { readonly folded: string }> = [];
  for (const claim of claims) {
    if (new TextEncoder().encode(`${root}/${claim.address}`).length > 4095)
      return Result.fail(
        new SourceAddressInvalid({
          detail:
            "Retained package path exceeds the filesystem limit; use a shorter workspace root or source address",
        }),
      );
    const folded = portableAddress(claim.address);
    if (Result.isFailure(folded)) return Result.fail(folded.failure);
    for (const prior of seen) {
      if (prior.packageKey === claim.packageKey && prior.address === claim.address) continue;
      if (
        prior.folded === folded.success ||
        prior.folded.startsWith(`${folded.success}/`) ||
        folded.success.startsWith(`${prior.folded}/`)
      )
        return Result.fail(
          new SourceAddressInvalid({
            detail: `Retained package source addresses overlap: ${prior.packageKey} at ${prior.address} and ${claim.packageKey} at ${claim.address}; select distinct complete package boundaries`,
          }),
        );
    }
    seen.push({ ...claim, folded: folded.success });
  }
  return Result.succeed(undefined);
};
