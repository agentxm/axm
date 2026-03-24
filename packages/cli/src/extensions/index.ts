// Re-export data layer from core
export * from "@axm.sh/core/unstable/extensions";

// Keep CLI-specific exports
export {
  buildRegistrySkillRef,
  buildRegistryCommandRef,
  buildRegistryMcpServerRef,
} from "./registry-ref-builders.js";
