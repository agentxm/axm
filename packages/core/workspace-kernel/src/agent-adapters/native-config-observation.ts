/** Incomplete native observations are evidence, separate from entries and ownership. */
import type { PlatformError } from "effect/PlatformError";
import type { NativeLocationError, OwnershipUnitAddress } from "../locations/index.js";
import type { HookConfigInvalid, McpConfigInvalid, McpConfigIoFailed } from "./errors.js";

interface NativeConfigObservationContext {
  readonly extensionType: "hook" | "mcp-server";
  readonly address: OwnershipUnitAddress;
  readonly aliases: ReadonlyArray<string>;
  readonly claimantAgentIds: ReadonlyArray<string>;
}

/** Causes remain internal: parsers may retain credentials from native configuration. */
export type NativeConfigObservationDiagnostic = NativeConfigObservationContext &
  (
    | { readonly stage: "resolve"; readonly cause: NativeLocationError | McpConfigInvalid }
    | { readonly stage: "read"; readonly cause: PlatformError | McpConfigIoFailed }
    | { readonly stage: "decode"; readonly cause: HookConfigInvalid | McpConfigInvalid }
  );

/** Deliberately project only owned classifications; never format a parser or platform cause. */
export const nativeConfigObservationReason = (
  diagnostic: NativeConfigObservationDiagnostic,
): string =>
  `${diagnostic.extensionType === "hook" ? "Hook" : "MCP"} configuration ${diagnostic.stage} failed for ${diagnostic.claimantAgentIds.join(", ")}; native ownership is unverified`;
