# Lisa

[![npm version](https://img.shields.io/npm/v/smartlisa.svg)](https://www.npmjs.com/package/smartlisa)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

![Lisa Banner](lisa-banner.jpg)

*Lisa keeps it organized. The Ralphs get it done.*

---

**Meet Lisa.** The smart AI project manager that never loses context. She breaks down complex projects into **Milestones → Epics → Stories** and hands off tasks — to Claude, your dev team, Linear, or a swarm of [Ralph Wiggum loops](https://github.com/ghuntley/how-to-ralph-wiggum) running overnight.

**One planner. Any executor.** Whether it's a senior engineer, a junior dev, or an AI agent bumping into walls until tests pass — Lisa doesn't care who picks up the card. She just needs it done.

**The new bottleneck isn't coding.** AI writes code faster than teams can plan and review it. Lisa helps PMs, tech leads, and solo devs break work into well-scoped stories *before* the Ralphs start running — so you're not scrambling to keep up with your own agents.

## Installation

### CLI Tool

```bash
npm install -g smartlisa
```

```
          _     ___ ____    _
         | |   |_ _/ ___|  / \
         | |    | |\___ \ / _ \
         | |___ | | ___) / ___ \
         |_____|___|____/_/   \_\

```

### Claude Code Skills

Lisa works as a Claude Code skill. Choose one installation method:

**Via Plugin (Recommended)**
```bash
# Add the marketplace
/plugin marketplace add klosowsk/lisa

# Install the plugin
/plugin install lisa@lisa
```

**As Project Skills** (anyone cloning repo gets them)
```bash
# Copy to your project
cp -r path/to/lisa/skills/lisa your-project/.claude/skills/
cp -r path/to/lisa/skills/lisa-work your-project/.claude/skills/
```

**As Personal Skills** (available in all your projects)
```bash
# Symlink to your personal skills directory
ln -s $(pwd)/skills/lisa ~/.claude/skills/lisa
ln -s $(pwd)/skills/lisa-work ~/.claude/skills/lisa-work
```

## Using with Claude Code

Lisa is a Claude Code skill. Just ask:

> "Help me plan this feature with Lisa"

> "/lisa status"

> "Work on the next story"

Claude uses Lisa's structured plans to systematically implement your project — no more wandering in circles.

## CLI Commands

```bash
lisa status              # Project overview
lisa status board        # Kanban view of stories
lisa status show E1.S2   # Details for a specific item

lisa discover init       # Start a new project
lisa discover            # Continue discovery

lisa plan milestones        # View roadmap
lisa plan add-epic          # Add a feature
lisa plan generate-stories  # Create stories from PRD

lisa feedback mark E1.S2 done   # Update status
lisa validate                   # Check plan integrity
```

### LLM as Runtime

Lisa treats the AI as an operating system. Every command returns structured context that both humans and agents can read — same interface, same data, different consumer.

```
$ lisa status board --milestone M1

                    ═══ Lisa Board ═══

TODO          IN_PROGRESS   REVIEW        DONE
─────────────────────────────────────────────────
E1.S3         E1.S2                       E1.S1
E2.S1
E2.S2
```

```
$ lisa status show E1.S2

═══ Story: E1.S2 ═══
Add login form

  Epic: Authentication
  Status: in_progress
  Type: feature

Description
  Create login form with email/password fields and validation

Acceptance Criteria
  [ ] Email field with format validation
  [ ] Password field with show/hide toggle
  [ ] "Remember me" checkbox persists session
  [ ] Error messages display below fields
  [ ] Loading spinner during submission

Architecture Context (from architecture.md)
  ## Authentication Flow
  - JWT tokens stored in httpOnly cookies
  - Refresh token rotation on each request
  ...
```

Context resets. Agents don't remember. **Lisa does.** Any agent can pick up where the last one left off — just run `lisa status` and get full context.

## How It Works

```
Project
└── Milestone (M1)              # "MVP", "Beta", "Launch"
    └── Epic (E1)               # "Auth", "Payments"
        ├── prd.md              # Full requirements
        ├── architecture.md     # Technical design
        └── Story (E1.S1)       # "Add login form"
```

Each epic carries a full **PRD** and **architecture doc** — the complete context an agent needs to make good decisions. No more "I don't have enough context" excuses.

Stories flow: `todo → in_progress → review → done`

All data lives in `.lisa/` — version it, share it, let any agent pick up where the last one left off.



## License

MIT
