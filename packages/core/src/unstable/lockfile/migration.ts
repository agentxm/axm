import type { Lockfile, SkillLockEntry } from "./schema.js";
import { LOCKFILE_VERSION } from "./schema.js";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasLegacyUniversalArtifact = (rawLockfile: unknown, skillName: string): boolean => {
  if (!isRecord(rawLockfile)) return false;
  const rawSkills = rawLockfile["skills"];
  if (!isRecord(rawSkills)) return false;
  const rawSkill = rawSkills[skillName];
  return isRecord(rawSkill) && Object.hasOwn(rawSkill, "universalArtifact");
};

export const migrateLegacyUniversalSkillArtifacts = (
  rawLockfile: unknown,
  decoded: Lockfile,
): Lockfile => {
  let changed = decoded.lockfileVersion < LOCKFILE_VERSION;
  const skills: Record<string, SkillLockEntry> = {};

  for (const [name, entry] of Object.entries(decoded.skills)) {
    if (hasLegacyUniversalArtifact(rawLockfile, name) && !entry.agents.includes("universal")) {
      skills[name] = { ...entry, agents: ["universal", ...entry.agents] };
      changed = true;
    } else {
      skills[name] = entry;
    }
  }

  if (!changed) return decoded;
  return {
    ...decoded,
    lockfileVersion: LOCKFILE_VERSION,
    skills,
  };
};
