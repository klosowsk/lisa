# Lisa Workflow Examples

Practical examples for common planning scenarios.

## Example 1: Starting a New Project

User says: "Help me plan a todo app"

```bash
# 1. Initialize the project
lisa discover init "Todo App"
# 2. Follow the INSTRUCTIONS in the output (it will tell you to ask discovery questions)
```

**Key points:**
- Ask user for project name before initializing
- After init, follow the AI guidance in the command output
- The guidance will prompt you to start a discovery conversation

---

## Example 2: Existing Codebase

User says: "Help me plan features for my existing app"

```bash
# 1. Initialize
lisa discover init "My Existing App"
# 2. Follow the INSTRUCTIONS - acknowledge what you learned, then ask discovery questions
```

**Key points:**
- Briefly acknowledge what you learned from the codebase (1-2 sentences)
- Then ask the discovery question (e.g., "What problem are we solving?")
- Do NOT offer menu options - just ask the question

---

## Example 3: Creating the Roadmap

User says: "I have some tickets related to knowledge improvements... need to edit digests, massage prompts..."

**Step 1: Summarize what you understood**
> "I understand you have work around Knowledge V1 MVP with several areas:
> - Editing knowledge evaluation digests
> - Prompt improvements for interview questions
> - New action set digests
> - Deprecating old digest sections
>
> Here's what I propose to create:
>
> **Milestone: Knowledge V1 MVP**
> - Epic 1: Digest Editing - ability to edit evaluation digests
> - Epic 2: Interview Question Improvements - prompt massage for focus
> - Epic 3: Action Set Digests - new digest type
> - Epic 4: Digest Cleanup - deprecate pre-arrival sections
>
> Does this structure look right? Any adjustments?"

**Step 2: Wait for user confirmation**

**Step 3: Only after approval, create the artifacts**
```bash
lisa plan add-milestone \
  --name 'Knowledge V1 MVP' \
  --description 'Core knowledge system improvements including digest editing and cleanup'

lisa plan add-epic \
  --milestone M1 \
  --name 'Digest Editing' \
  --description 'Enable editing of knowledge evaluation digests'
# ... etc
```

**Key points:**
- **ALWAYS present proposed structure before creating**
- Summarize user's intent first
- List milestones and epics you plan to create
- Wait for explicit approval
- Never auto-create artifacts

---

## Example 4: Generating Stories

User says: "Generate stories for the authentication epic"

```bash
# 1. View epic details
lisa plan epic E1

# 2. Generate stories for the epic
lisa plan stories E1

# 3. View the generated stories
lisa status board E1
```

---

## Example 5: Working on Stories

User says: "What should I work on?" or "Show me story E1.S2"

```bash
# View the kanban board
lisa status board

# Get details on a specific story
lisa status show E1.S2

# Understand why this story exists
lisa status why E1.S2

# Get implementation guidance
lisa status how E1.S2

# Get full context for implementation
lisa status context E1.S2 --full
```

---

## Example 6: Tracking Progress

User says: "I finished E1.S2" or "E1.S3 is blocked"

```bash
# Mark story as done
lisa feedback mark E1.S2 done

# Mark story as blocked with reason
lisa feedback mark E1.S3 blocked \
  --reason "Waiting for API documentation"

# Start working on a story
lisa feedback mark E1.S4 in_progress

# Mark for review
lisa feedback mark E1.S4 review
```

---

## Example 7: Adding Feedback

User says: "There's a problem with this story" or "I have a question"

```bash
# Report a blocker
lisa feedback add E1.S2 \
  --type blocker \
  --message "API endpoint returns wrong format"

# Ask a question
lisa feedback add E1.S3 \
  --type question \
  --message "Should we support pagination?"

# Report scope issue
lisa feedback add E2.S1 \
  --type scope \
  --message "This needs to handle bulk operations too"

# View all pending feedback
lisa feedback

# Resolve feedback
lisa feedback resolve fb-abc123 \
  --resolution "Added pagination support"

# Dismiss feedback (not actionable)
lisa feedback dismiss fb-xyz789
```

---

## Example 8: Validation

User says: "Validate my plan" or "Check for issues"

```bash
# Run full validation
lisa validate

# Check just cross-references
lisa validate links

# Check requirement coverage
lisa validate coverage

# Validate specific epic
lisa validate epic E1
```

---

## Example 9: Quick Status Check

User says: "Lisa status" or "What's the project state?"

```bash
# Project overview
lisa status

# Kanban board
lisa status board

# Context for a specific item
lisa status context E1 --full
lisa status context M1
```

---

## Workflow Decision Tree

```
User request → What phase are we in?

No .lisa/ directory?
  → Ask for project name
  → lisa discover init "Name"

Discovery incomplete?
  → lisa discover
  → lisa discover status

No milestones?
  → lisa plan milestones

No epics?
  → lisa plan epics M1

No stories?
  → lisa plan stories E1

Working on implementation?
  → lisa status how E1.S2
  → lisa feedback mark E1.S2 in_progress

Need to validate?
  → lisa validate
```

---

## Common Patterns

### Pattern: Starting a conversation about planning

1. Check if `.lisa/` exists
2. If not, ask user: "What would you like to name this project?"
3. Initialize and start discovery

### Pattern: User asks "what's next?"

```bash
lisa status
lisa status board
```

### Pattern: User completed work

```bash
lisa feedback mark <story-id> done
lisa status board  # Show updated board
```

### Pattern: User is stuck

```bash
lisa status how <story-id>  # Implementation guidance
lisa status why <story-id>  # Context and reasoning
```
