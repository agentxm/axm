## 1. Implementation

- [ ] 1.1 Add `init [path]` subcommand to extensions command group
- [ ] 1.2 Parse `--publisher` option and `-y, --yes` flag
- [ ] 1.3 Create `.axm/` directory structure at target path
- [ ] 1.4 Create `.axm/settings.json` with publisher and targets
- [ ] 1.5 Handle idempotent initialization (preserve existing config)
- [ ] 1.6 Add success/status messages for user feedback

## 2. Testing

- [ ] 2.1 Unit tests for init command handler
- [ ] 2.2 Integration tests for directory and file creation
- [ ] 2.3 Test idempotent behavior (run twice, no errors)
- [ ] 2.4 Test --publisher option sets publisher in config
- [ ] 2.5 Test -y flag skips prompts

## 3. Documentation

- [ ] 3.1 Update CLI help text
