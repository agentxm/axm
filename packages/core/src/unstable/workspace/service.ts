/**
 * Workspace context service tag.
 *
 * The Workspace Effect service tag lives in core so that any package
 * can depend on the workspace abstraction. The full interface definition
 * and implementation (`make` / `layer`) live in the CLI package.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Re-export the Workspace tag — the actual class is defined in the CLI package
// and registered here so core modules can reference it.
// This file exists to provide a stable import path from core.

// For now, the Workspace class and WorkspaceContextService interface
// remain in the CLI package until all extension modules are moved to core.
// This file is a placeholder for the future.
