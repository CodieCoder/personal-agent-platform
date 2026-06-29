# Coding Agents

This directory contains generic coding-agent rules and reusable agent skills for working on
the repository.

## Layout

- `rules/` contains repository-wide rules for coding agents.
- `skills/` contains workflow skills for coding agents.
  - `skills/commit-message/` defines the required commit title and body standard.

This directory is separate from product runtime skills. Runtime skills belong inside their
owning capability packages, such as `packages/capabilities/echo/skills/`, and must not be mixed
into this generic agent guidance.
