import { registryFlag } from "../../cli-flags/index.js";
import * as DateTime from "effect/DateTime";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/cli";

import {
  currentIdentity,
  describeTokenPermissions,
  selectedRegistry,
  TokenPermissionsSchema,
} from "@agentxm/registry-access/authentication";
import { emitResult, rawDoc } from "../../screen/index.js";
import { observeUnit } from "@agentxm/workspace-kernel/operations";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";

export const WhoamiDocumentSchema = Schema.Struct({
  user: Schema.String,
  registry: Schema.String,
  credentialType: Schema.String,
  authority: Schema.Literals(["account", "limited"]),
  permissions: Schema.NullOr(TokenPermissionsSchema),
  resourceRestrictions: Schema.NullOr(
    Schema.Struct({ extensions: Schema.NullOr(Schema.Array(Schema.String)) }),
  ),
  expiresAt: Schema.NullOr(DateTimeUtcSchema),
  approvedAt: Schema.NullOr(DateTimeUtcSchema),
  trustedPublisher: Schema.NullOr(Schema.Struct({ name: Schema.String })),
});
export type WhoamiDocument = typeof WhoamiDocumentSchema.Type;

export const handleWhoami = Effect.fn("AuthWhoami.handle")(
  function* () {
    const registry = yield* selectedRegistry;

    const identity = yield* withLiveOperation(
      { command: "auth.whoami", name: `Check identity on ${registry.host}`, mode: "query" },
      observeUnit(
        { id: "identity", label: `identity on ${registry.host}` },
        currentIdentity(registry.url),
      ),
    );

    yield* emitResult(identity, WhoamiDocumentSchema, () => {
      const restrictions = identity.resourceRestrictions?.extensions ?? null;
      const limits =
        identity.authority === "account"
          ? [`Authority  everything your permissions allow`]
          : [
              `Authority  limited`,
              `Can do  ${describeTokenPermissions(identity.permissions)}`,
              `Extensions  ${restrictions === null ? "unrestricted" : restrictions.length === 0 ? "none" : restrictions.join(", ")}`,
            ];
      return rawDoc(
        [
          `Authenticated as ${identity.user}`,
          `Registry  ${identity.registry}`,
          `Credential  ${identity.credentialType}`,
          // A workload token acts for its owner under a trusted publisher's
          // permissions; which publisher is what a CI log reader needs.
          ...(identity.trustedPublisher === null
            ? []
            : [`Trusted publisher  ${identity.trustedPublisher.name}`]),
          ...limits,
          // Only a CLI session has an approving sign-in, and how recently that
          // person authenticated is what stands behind this session's
          // authority.
          ...(identity.approvedAt === null
            ? []
            : [`Approved  ${DateTime.formatIso(identity.approvedAt)}`]),
          `Expires  ${identity.expiresAt === null ? "unavailable" : DateTime.formatIso(identity.expiresAt)}`,
          "",
        ].join("\n"),
      );
    });
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const whoamiConfig = { registry: registryFlag } as const;

export const whoamiCommand = Command.make("whoami", whoamiConfig, ({ registry }) =>
  handleWhoami().pipe(withRuntime("auth whoami", { registry })),
).pipe(
  withArgvTracking(whoamiConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm whoami", description: "Check who you're authenticated as" },
    { command: "axm whoami --json", description: "Get identity as JSON for scripts" },
  ]),
);
