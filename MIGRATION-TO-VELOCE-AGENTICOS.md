# Veloce AgenticOS Brand Migration

## Current Release

Visible product surfaces use **Veloce AgenticOS**. Existing technical identifiers remain intentionally stable:

- repository folder: `AgentOS`
- local configuration directory: `~/.agentic-os`
- local storage keys and environment variables
- existing vault and runtime directories

This preserves working installations and avoids an unsafe global filesystem migration.

## Future Filesystem Migration

Do not rename the project directory or `~/.agentic-os` in place. A future migration must:

1. Stop the dashboard and back up the existing local configuration directory.
2. Move one path at a time while maintaining compatibility symlinks.
3. Update all scripts, environment docs, launch agents, and generated artifact pointers.
4. Run a full build, API, vault, CLI, and browser regression suite.
5. Retain the compatibility path until at least one stable release has passed.
