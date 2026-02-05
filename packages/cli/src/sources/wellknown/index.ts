/**
 * Well-known skills discovery module.
 *
 * Provides functionality to discover and fetch skills from HTTP(S) hosts
 * using the well-known URI pattern per RFC 8615.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Types
export type { WellKnownIndex, WellKnownSkill } from "./types.js";

// Errors
export type { WellKnownError } from "./errors.js";
export {
  WellKnownFetchError,
  WellKnownInvalidIndexError,
  WellKnownNotFoundError,
} from "./errors.js";

// Discovery
export {
  discoverWellKnownSkills,
  fetchWellKnownIndex,
  isWellKnownEligible,
  type DiscoveredSkill,
} from "./discovery.js";

// Fetch
export { fetchSkillFiles } from "./fetch.js";
