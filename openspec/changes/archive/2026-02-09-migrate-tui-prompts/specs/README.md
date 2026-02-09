# Specs: migrate-tui-prompts

No new or modified capabilities. This change is a pure implementation migration — swapping the `clack-effect` service for existing TUI services. All prompt behavior remains identical to existing specs:

- `tui-confirm`, `tui-select`, `tui-multiselect`, `tui-text-input`, `tui-password-input` — prompt behavior
- `tui-log`, `tui-spinner`, `tui-note` — output behavior
- `cli-skills-install`, `cli-skills-install-post-discovery` — install flow
- `skills-uninstall-build-plan` — uninstall flow
