---
name: lisa
description: Plan and organize projects into milestones, epics, and stories. Use when breaking down work, creating roadmaps, planning features, asking "what should I work on?", "lisa status", "show me the board", organizing a project, or when user wants to scope and structure development work. Also triggers on "help me plan", "break this down", "create a roadmap", or "add milestone/epic/story".
user-invocable: true
---

# Lisa - Planning Mode

Plan and organize projects into milestones, epics, and stories.

## Core Principles

1. **Follow command output instructions.** Every Lisa command returns AI guidance with next steps. Read and follow them exactly.

2. **Present before creating.** When the user describes work to be done:
   - Summarize what you understood
   - Propose the milestones, epics, stories or artifacts you plan to create
   - Wait for user confirmation before running any `add-milestone`, `add-epic`, or `add-story` commands
   - Never auto-create artifacts without explicit approval

## Quick Start

```bash
# Check project state and get guidance on what to do next
lisa status

# New project - get name first, then:
lisa discover init "Project Name"

# View board
lisa status board
```

## Workflow

1. Run `lisa status` to see current state
2. **Follow the INSTRUCTIONS section** in the output - it usually tells you what to do next or existing options

## Commands

| Action | Command |
|--------|---------|
| Status | `lisa status` |
| Board | `lisa status board` |
| Initialize | `lisa discover init "Name"` |
| Continue discovery | `lisa discover` |
| Add discovery entry | `lisa discover add-entry --category <cat> --question '<q>' --answer '<a>'` |
| View milestones | `lisa plan milestones` |
| Add milestone | `lisa plan add-milestone --name 'Name' --description 'Desc'` |
| Add epic | `lisa plan add-epic --milestone M1 --name 'Name' --description 'Desc'` |
| Generate stories | `lisa plan stories E1` |
| Mark progress | `lisa feedback mark <id> <status>` |

## ID Formats

- Milestone: `M1`, `M2`
- Epic: `E1`, `E2`
- Story: `E1.S1`, `E1.S2`

## References

- [commands.md](references/commands.md) - Full command reference
