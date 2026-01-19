# Lisa Work - Detailed Implementation Workflow

Step-by-step guide for implementing stories with `/lisa-work`.

## Story Selection Flow

### With Story ID: `/lisa-work E1.S2`

1. Validate the story exists:
   ```bash
   lisa status show E1.S2
   ```

2. If not found, show error and suggest:
   ```bash
   lisa status board
   ```

### Without Story ID: `/lisa-work`

1. Get the current board:
   ```bash
   lisa status board
   ```

2. Present available stories to the user, highlighting:
   - Stories with status `todo`
   - Stories whose dependencies are all `done`

3. Ask: "Which story would you like to work on?"

4. Recommend the best candidate:
   - First `todo` story with no pending dependencies
   - Lowest epic number, then lowest story number

## Context Loading

### Primary Context

```bash
lisa status context E1.S2 --full
```

This returns:
- Story details (title, description, acceptance criteria)
- Epic information
- Milestone context
- Architecture reference
- Project-level discovery context

### Implementation Guidance

```bash
lisa status how E1.S2
```

This returns:
- Implementation checklist based on acceptance criteria
- Architecture reference snippets
- Stack context (tech stack, patterns)
- Dependency status

### Story Rationale (Optional)

```bash
lisa status why E1.S2
```

Use this when the user wants to understand:
- Why this story exists
- What requirements it fulfills
- How it connects to the epic/milestone goals

## Working Context Presentation

After loading context, present it in this format:

```markdown
## Working on: E1.S2 - [Story Title]

**Epic:** E1 - [Epic Name]
**Status:** in_progress

### Description
[Story description from context]

### Acceptance Criteria
- [ ] First criterion
- [ ] Second criterion
- [ ] Third criterion

### Architecture Notes
[Relevant sections from architecture.md]

### Dependencies
- E1.S1: done - [Title]

### Ready to implement!
```

## During Implementation

### Tracking Progress

As you work through acceptance criteria:
- Check off each criterion as it's completed
- Reference architecture for patterns
- Ask clarifying questions if needed

### Handling Issues

**Blocked by external dependency:**
```bash
lisa feedback mark E1.S2 blocked --reason "Waiting for API endpoint"
lisa feedback add E1.S2 --type blocker --message "Need /api/users endpoint"
```

**Missing information:**
```bash
lisa feedback add E1.S2 --type gap --message "Architecture doesn't specify error handling"
```

**Scope question:**
```bash
lisa feedback add E1.S2 --type question --message "Should this support pagination?"
```

### Feedback Types

| Type | Use When |
|------|----------|
| `blocker` | Something external is blocking progress |
| `gap` | Missing information or requirement |
| `scope` | Scope change or clarification needed |
| `conflict` | Conflicting requirements found |
| `question` | Need answer to proceed |

## Completing Work

### Review Before Closing

**Never mark a story done without explicit user confirmation.**

1. When all acceptance criteria appear complete, ask:
   > "All acceptance criteria look complete. Would you like to review the changes before marking E1.S2 as done?"

2. Wait for user response:
   - **"Yes, mark it done"** → proceed to mark done
   - **"Let me review"** → help them review the changes
   - **"Not yet, I found an issue"** → continue implementation

### Marking Done (After User Approval)

Only after explicit user confirmation:

```bash
lisa feedback mark E1.S2 done --reason "Implemented all acceptance criteria"
```

### Next Steps

After completion, offer:
1. Work on the next story
2. View the updated board
3. Take a break

```bash
lisa status board
```

## Error Handling

### Story Not Found

```
Error: Story E1.S99 not found.

Available stories:
  lisa status board
```

### Epic Not Found

```
Error: Epic E99 not found.

Check available epics:
  lisa plan epics
```

### No Stories Available

```
No todo stories found.

Options:
- Generate stories: lisa plan stories E1
- Check board: lisa status board
```

### Dependencies Not Complete

```
Warning: E1.S2 depends on E1.S1 which is still 'todo'.

Recommendation:
- Work on E1.S1 first
- Or proceed with caution (may need rework)
```

### Context Loading Failure

```
Error: Architecture not found for E1.

Generate artifacts first:
  lisa plan epic E1
```

## Tips for Effective Implementation

1. **Read the architecture first** - Understand patterns before coding
2. **Check dependencies** - Ensure prerequisite stories are done
3. **Work through criteria sequentially** - Don't skip around
4. **Mark blocked early** - Don't spin on issues
5. **Add feedback for plan gaps** - Help improve future stories
