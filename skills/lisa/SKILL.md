---
name: lisa
description: Plan and organize projects into milestones, epics, and stories. Use when breaking down work, creating roadmaps, planning features, asking "what should I work on?", "lisa status", "show me the board", organizing a project, or when user wants to scope and structure development work. Also triggers on "help me plan", "break this down", "create a roadmap", or "add milestone/epic/story".
user-invocable: true
---

# Lisa - Planning Mode

Plan and organize projects into milestones, epics, and stories.

## Quick Start

```bash
# Check project status
lisa status

# Start a new project
lisa discover init "Project Name"

# View the board
lisa status board
```

## Workflow

### New Project

1. **Ask for project name** - Confirm what they're building
2. **Initialize**: `lisa discover init "Project Name"`
3. **Check for existing code** - Read key files to understand patterns
4. **Discovery conversation** - Natural Q&A about problem, vision, constraints
   - For brownfield: suggest answers based on what you read

### Existing Project

1. **Check status**: `lisa status`
2. **View board**: `lisa status board`
3. **Add to plan** or **work on stories** as needed

## Commands Reference

| Action | Command |
|--------|---------|
| Project overview | `lisa status` |
| Kanban board | `lisa status board` |
| Story details | `lisa status show <id>` |
| Start discovery | `lisa discover init "Name"` |
| Continue discovery | `lisa discover` |
| View milestones | `lisa plan milestones` |
| Add milestone | `lisa plan add-milestone --name 'Name' --description 'Desc'` |
| Add epic | `lisa plan add-epic --milestone M1 --name 'Name' --description 'Desc'` |
| Generate stories | `lisa plan stories E1` |
| Mark progress | `lisa feedback mark <id> <status>` |
| Validate plan | `lisa validate` |

## ID Formats

| Type | Format | Example |
|------|--------|---------|
| Milestone | `M#` | `M1` |
| Epic | `E#` | `E1` |
| Story | `E#.S#` | `E1.S2` |

## References

- [commands.md](references/commands.md) - Full command reference
- [examples.md](references/examples.md) - Workflow examples
