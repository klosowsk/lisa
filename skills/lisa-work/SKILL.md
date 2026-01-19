---
name: lisa-work
description: Implement Lisa stories with full context. Use when asked to "work on E1.S2", "implement this story", "start working on", "help me build", "pick up a task", "next story", or when implementing specific stories from the Lisa plan. Also triggers on "implement E1.S1", "let's code this story", or "start the next task".
user-invocable: true
---

# Lisa - Implementation Mode

Implement stories with full context, architecture, and acceptance criteria.

## Quick Start

```bash
# Work on a specific story
/lisa-work E1.S2

# See available stories and pick one
/lisa-work
```

## Workflow

### Phase 1: Story Selection

**If story ID provided** (e.g., `/lisa-work E1.S2`):
- Validate the story exists
- Load its context directly

**If no story ID** (e.g., `/lisa-work`):
1. Run `lisa status board` to see available stories
2. Ask the user which story to work on
3. Recommend stories that are `todo` with dependencies `done`

### Phase 2: Load Context

```bash
lisa status context E1.S2 --full
```

### Phase 3: Mark In Progress

```bash
lisa feedback mark E1.S2 in_progress
```

### Phase 4: Present Working Context

Summarize for the user:
- **Story**: Title, description
- **Acceptance Criteria**: As a checklist
- **Architecture**: Relevant patterns
- **Dependencies**: Status of prerequisites

### Phase 5: Implement

- Follow acceptance criteria as a checklist
- Reference architecture for patterns
- Never mention story IDs in code comments

**If blocked:**
```bash
lisa feedback mark E1.S2 blocked --reason "Describe the issue"
```

### Phase 6: Complete

1. Ask user to confirm all criteria are met
2. Only after explicit approval:
   ```bash
   lisa feedback mark E1.S2 done --reason "Brief summary"
   ```
3. Offer next steps

**Important:** Never mark done without user confirmation.

## Commands Reference

| Action | Command |
|--------|---------|
| View board | `lisa status board` |
| Full context | `lisa status context <id> --full` |
| Why it exists | `lisa status why <id>` |
| Mark in progress | `lisa feedback mark <id> in_progress` |
| Mark blocked | `lisa feedback mark <id> blocked --reason "..."` |
| Mark done | `lisa feedback mark <id> done --reason "..."` |
| Add feedback | `lisa feedback add <id> --type <type> --message "..."` |

## Story Status Flow

```
todo → in_progress → review → done
          ↓
        blocked
```

## References

- [workflow.md](references/workflow.md) - Detailed workflow and error handling
