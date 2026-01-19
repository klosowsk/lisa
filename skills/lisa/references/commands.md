# Lisa Command Reference

Complete reference for all Lisa CLI commands. Use `--help` with any command for quick help.

## Discovery Commands

Gather project context through guided discovery sessions.

```bash
lisa discover [subcommand] [options]
```

| Subcommand | Description |
|------------|-------------|
| *(none)* | Start or continue discovery session |
| `init <name>` | Initialize new project |
| `status` | Show discovery progress and gaps |
| `complete` | Mark discovery phase complete |
| `add-entry` | Add discovery entry manually |
| `epic <id>` | Start discovery for specific epic |
| `milestone <id>` | Start discovery for milestone |

### Discovery Options

| Option | Description |
|--------|-------------|
| `--quick` | Essentials only (problem, vision, success) |
| `--standard` | Balanced depth (default) |
| `--deep` | Comprehensive discovery |

### Add Entry Options

| Option | Description |
|--------|-------------|
| `--category <cat>` | Category: `problem`, `goals`, `users`, `constraints`, `scope`, `technical`, `risks`, `success` |
| `--question '<q>'` | The discovery question |
| `--answer '<a>'` | The answer/information |

---

## Plan Commands

Create and manage roadmap artifacts.

```bash
lisa plan [subcommand] [options]
```

| Subcommand | Description |
|------------|-------------|
| *(none)* | Show milestones |
| `milestones` | List all milestones |
| `add-milestone` | Add new milestone |
| `epics [M1]` | List epics (optionally filter by milestone) |
| `add-epic` | Add new epic to milestone |
| `epic <id>` | View/plan specific epic |
| `stories <id>` | List stories for epic |

### Add Milestone Options

| Option | Description |
|--------|-------------|
| `--name '<name>'` | Milestone name (required) |
| `--description '<desc>'` | Milestone description (required) |

### Add Epic Options

| Option | Description |
|--------|-------------|
| `--milestone <M1>` | Parent milestone ID (required) |
| `--name '<name>'` | Epic name (required) |
| `--description '<desc>'` | Epic description (required) |

---

## Status Commands

View project state and story details.

```bash
lisa status [subcommand] [options]
```

| Subcommand | Description |
|------------|-------------|
| *(none)* | Project overview with phase and progress |
| `board [epic]` | Kanban board (optionally filter by epic) |
| `show <id>` | Detailed story information |
| `context [target]` | Context for project, milestone, epic, or story |
| `why <id>` | Explain story lineage (trace requirements) |
| `how <id>` | Implementation guidance |

### Status Options

| Option | Description |
|--------|-------------|
| `--full` | Full output without truncation |
| `--format json` | Output in JSON format |

### ID Formats

| Format | Example | Description |
|--------|---------|-------------|
| Milestone | `M1` | Milestone 1 |
| Epic | `E1` | Epic 1 |
| Story | `E1.S2` | Epic 1, Story 2 |

---

## Feedback Commands

Track progress and manage feedback items.

```bash
lisa feedback [subcommand] [options]
```

| Subcommand | Description |
|------------|-------------|
| *(none)* | List all pending feedback items |
| `mark <id> <status>` | Update story status |
| `add <id>` | Add feedback to story |
| `resolve <fb-id>` | Mark feedback as resolved |
| `dismiss <fb-id>` | Dismiss feedback without action |

### Story Statuses

| Status | Description |
|--------|-------------|
| `todo` | Not started |
| `assigned` | Assigned to someone |
| `in_progress` | Work in progress |
| `review` | In review |
| `done` | Completed |
| `blocked` | Blocked by dependency/issue |
| `deferred` | Postponed to later |

### Feedback Types

| Type | Description |
|------|-------------|
| `blocker` | Something blocking progress |
| `gap` | Missing information or requirement |
| `scope` | Scope change or clarification needed |
| `conflict` | Conflicting requirements |
| `question` | Question needing answer |

### Feedback Options

| Option | Description |
|--------|-------------|
| `--reason '<text>'` | Reason for status change (mark) |
| `--type <type>` | Feedback type (add) |
| `--message '<text>'` | Feedback message (add) |
| `--resolution '<text>'` | Resolution note (resolve) |

---

## Validate Commands

Check plan integrity and coverage.

```bash
lisa validate [subcommand]
```

| Subcommand | Description |
|------------|-------------|
| *(none)* | Run full validation suite |
| `links` | Check all cross-references |
| `coverage` | Check requirement coverage |
| `epic <id>` | Validate specific epic |

### What Gets Validated

- All story IDs reference valid epics
- All epic IDs reference valid milestones
- No orphaned or dangling references
- Requirements have implementing stories
- Stories have acceptance criteria
- Epic scope is complete and consistent

---

## Global Options

Available on all commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help for command |
| `--full` | Show full output without truncation |
| `--format json` | Output in JSON format |

## Examples

```bash
lisa status --help
lisa discover --deep
lisa feedback mark E1.S2 done
```
