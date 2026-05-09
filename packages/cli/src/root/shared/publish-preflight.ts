import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as semver from "semver";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { extensionTypeToPlural, parseFqn } from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";

import { resolveManifestVersionInfo, type VersionableExtensionType } from "./extension-version.js";

export const checkPublishVersionPreflight = (args: {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
  readonly registryName: string;
  readonly registryUrl: string;
  readonly force: boolean;
}) =>
  Effect.gen(function* () {
    if (args.force) return;

    const local = yield* resolveManifestVersionInfo(args.fqn, args.type);
    const fqn = yield* parseFqn(args.fqn);
    const client = yield* createRegistryClient(args.registryUrl);
    const indexOption = yield* client.getExtensionIndex({
      owner: fqn.owner,
      type: fqn.type,
      name: fqn.name,
    });

    if (Option.isNone(indexOption)) return;

    const latest = indexOption.value.versions[0]?.version;
    if (latest === undefined || semver.gt(local.version, latest)) return;

    const plural = extensionTypeToPlural[args.type];
    return yield* makeAppError({
      code: "internal",
      message: `Cannot publish: local version ${local.version} is not greater than the latest published version ${latest}.`,
      breadcrumbs: [
        {
          description: `Bump the version first:\n  axm ${plural} version ${local.fqn} patch\n\nOverride with --force.`,
          cmd: `axm ${plural} version ${local.fqn} patch`,
        },
      ],
    });
  });
