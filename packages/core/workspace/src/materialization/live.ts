/**
 * Environment-backed layers of the materialization capability: the
 * registration of the kinds' managers as `workspace-projection` participants.
 * The managers themselves are composed from `./kinds-live`. Only application
 * composition roots import this module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { ProjectionParticipantsLive } from "./projection-participants-live.js";
