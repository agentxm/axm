import * as Option from "effect/Option";
import { PackageURL } from "packageurl-js";

import type { PackageType } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodePurl } from "./reader-io.js";
import type { DetectedPackage } from "./types.js";

interface DetectedPackageInput {
  readonly type: PackageType;
  readonly namespace?: string;
  readonly name: string;
  readonly version?: string;
  readonly source: string;
}

/** Builds a package identity without allowing malformed manifests to throw. */
export const makeDetectedPackage = (
  input: DetectedPackageInput,
): Option.Option<DetectedPackage> => {
  if (input.name.trim() === "") return Option.none();

  try {
    const purl = new PackageURL(
      input.type,
      input.namespace === undefined || input.namespace === "" ? null : input.namespace,
      input.name,
      input.version ?? null,
      null,
      null,
    );
    return Option.some({
      purl: decodePurl(purl.toString()),
      type: input.type,
      source: input.source,
    });
  } catch {
    return Option.none();
  }
};
