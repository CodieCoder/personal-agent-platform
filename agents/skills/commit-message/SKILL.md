---
name: commit-message
description: Use when Codex is asked to create a git commit, draft a commit title, write a commit message, or prepare staged changes for commit. Ensures every commit has a robust, specific title and a detailed body that explains scope, implementation, verification, and any intentional limits.
---

# Commit Message

## Workflow

1. Inspect the exact change set before writing the message:
   - `git status --short --untracked-files=all`
   - `git diff --stat`
   - `git diff --cached --stat` when staged changes exist
   - Targeted diffs for files that define the behavior being committed
2. Identify the main user-facing or developer-facing outcome, not just the files touched.
3. Use a specific title and a multi-paragraph body for every commit unless the user explicitly asks for a terse message.
4. Keep unrelated local changes out of the commit unless the user asks to commit all current changes.
5. Run or cite the verification that matches the risk of the changes before committing.

## Title Standard

- Use imperative mood.
- Prefer 50-72 characters when practical.
- Name the affected area first when it improves scanability, such as `runtime: Validate trace steps before persistence`.
- Avoid vague titles like `update files`, `fix issue`, `misc changes`, or `work in progress`.
- Do not use ticket IDs as the whole title; include the behavior change.

## Body Standard

Include enough detail for a future maintainer to understand why the commit exists without opening the full diff.

Use this shape when committing implementation work:

```text
Explain the problem or product slice this commit addresses.

Describe the important implementation choices, grouped by behavior rather
than by file list. Mention validation, persistence, UI, contracts, or docs
when they matter.

Verification:
- command that passed
- command that passed

Out of scope:
- intentional boundary, if useful
```

For docs-only commits, replace implementation details with the changed guidance and who should use it.

## Commit Command

Prefer multiple `-m` flags so the title and paragraphs are preserved:

```bash
git commit -m "area: Specific imperative title" \
  -m "First body paragraph." \
  -m "Second body paragraph." \
  -m "Verification:
- command"
```
