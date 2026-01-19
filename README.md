# Lisa

[![npm version](https://img.shields.io/npm/v/smartlisa.svg)](https://www.npmjs.com/package/smartlisa)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```
          _     ___ ____    _
         | |   |_ _/ ___|  / \
         | |    | |\___ \ / _ \
         | |___ | | ___) / ___ \
         |_____|___|____/_/   \_\

    "I'll handle the planning, you handle the coding."

          AI-powered planning for Claude Code
```

Lisa is the smart one. She breaks down complex projects into **Milestones → Epics → Stories** and hands off tasks to Claude, one story at a time.

## Installation

### CLI Tool

```bash
npm install -g smartlisa
```

### Claude Code Skills

Lisa works as a Claude Code skill. Choose one installation method:

**Via Plugin (Recommended)**
```bash
/plugin install github:klosowsk/lisa
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

lisa plan milestones     # View roadmap
lisa plan add-epic       # Add a feature
lisa plan generate-stories  # Create stories from PRD

lisa feedback mark E1.S2 done    # Update status
lisa validate                     # Check plan integrity
```

## How It Works

```
Project
└── Milestone (M1)        # "MVP", "Beta", "Launch"
    └── Epic (E1)         # "Auth", "Payments"
        └── Story (E1.S1) # "Add login form"
```

Stories flow: `todo → in_progress → review → done`

All data lives in `.lisa/` — version it, share it, let Claude pick up where you left off.

## Development

```bash
npm install
npm run dev          # Watch mode
npm test             # Run tests
npm run ci           # Full checks
```

## License

MIT
