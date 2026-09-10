/**
 * Pack ref types.
 *
 * Concrete pack refs built on top of the shared ref base hierarchy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PackRefBase, RegistryRefDetails, WorkspaceRefDetails } from "./ref-base.js";
import type { RegistrySource, WorkspaceSource } from "../../sources/types.js";

// -----------------------------------------------------------------------------
// Layer 3: Concrete Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryPackRef = PackRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type WorkspacePackRef = PackRefBase<"workspace", WorkspaceSource> & WorkspaceRefDetails;

/** @experimental */
export type PackRef = RegistryPackRef | WorkspacePackRef;
