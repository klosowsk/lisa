#!/usr/bin/env node
/**
 * Lisa CLI - Command Line Interface for Lisa Planning Engine
 *
 * A standalone CLI that can be used independently of Claude Code.
 *
 * Usage:
 *   lisa status           - Show project overview
 *   lisa discover         - Start/continue discovery
 *   lisa plan milestones  - Generate milestones
 *   ...
 */

import { createEngine } from "../../core/engine.js";
import { handleResult, output } from "./formatter.js";
import { DiscoveryDepth, StoryStatus, FeedbackType } from "../../core/schemas.js";

// ============================================================================
// Argument Parsing (simple, no dependencies)
// ============================================================================

interface ParsedArgs {
  command?: string;
  subcommand?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    positional: [],
    flags: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith("-")) {
        result.flags[key] = nextArg;
        i += 2;
      } else {
        result.flags[key] = true;
        i++;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      result.flags[key] = true;
      i++;
    } else {
      if (!result.command) {
        result.command = arg;
      } else if (!result.subcommand) {
        result.subcommand = arg;
      } else {
        result.positional.push(arg);
      }
      i++;
    }
  }

  return result;
}

// ============================================================================
// Help System
// ============================================================================

function showHelp(): void {
  // ASCII art banner
  console.log();
  console.log("     _     ___ ____    _    ");
  console.log("    | |   |_ _/ ___|  / \\   ");
  console.log("    | |    | |\\___ \\ / _ \\  ");
  console.log("    | |___ | | ___) / ___ \\ ");
  console.log("    |_____|___|____/_/   \\_\\");
  console.log();
  console.log("    AI-powered planning system");
  console.log();

  output.subheader("Usage:");
  console.log("  lisa <command> [subcommand] [options]");
  console.log("  lisa <command> --help         Show help for a specific command");
  output.blank();

  output.subheader("Commands:");
  console.log("  status       View project state and story details");
  console.log("  discover     Gather project context through guided discovery");
  console.log("  plan         Create and manage roadmap artifacts");
  console.log("  feedback     Track progress and manage feedback items");
  console.log("  validate     Check plan integrity and coverage");
  output.blank();

  output.subheader("Quick Start:");
  console.log("  lisa discover init \"My Project\"   Initialize a new project");
  console.log("  lisa discover                      Start discovery process");
  console.log("  lisa plan milestones               View/create milestones");
  console.log("  lisa status                        Check project overview");
  output.blank();

  output.subheader("Global Options:");
  console.log("  --help, -h       Show help (use with any command for details)");
  console.log("  --full           Show full output without truncation");
  console.log("  --format json    Output in JSON format");
  output.blank();

  output.subheader("Examples:");
  console.log("  lisa status --help                 Get help on status commands");
  console.log("  lisa discover --deep               Deep discovery mode");
  console.log("  lisa feedback mark E1.S1 done      Mark story as complete");
  console.log("  lisa status context E1 --full      View epic context in full");
  output.blank();

  output.subheader("Installation:");
  console.log("  npm install -g lisa-skill    Install globally");
  console.log("  npx lisa-skill               Run without installing");
  output.blank();
}

function showStatusHelp(): void {
  output.header("lisa status");
  console.log("View project state, story details, and context information.");
  output.blank();

  output.subheader("Usage:");
  console.log("  lisa status [subcommand] [options]");
  output.blank();

  output.subheader("Subcommands:");
  console.log("  (none)              Show project overview with phase and progress");
  console.log("  board [epic]        Show kanban board (optionally filter by epic)");
  console.log("  show <id>           Show detailed story information");
  console.log("  context [target]    Show context for project, milestone, epic, or story");
  console.log("  why <id>            Explain why a story exists (trace lineage)");
  console.log("  how <id>            Get implementation guidance for a story");
  output.blank();

  output.subheader("Options:");
  console.log("  --help, -h          Show this help");
  console.log("  --full              Show full output without truncation");
  console.log("  --format json       Output in JSON format");
  output.blank();

  output.subheader("Arguments:");
  console.log("  <id>       Story ID in format E1.S2 (Epic 1, Story 2)");
  console.log("  [epic]     Epic ID in format E1 (optional filter for board)");
  console.log("  [target]   M1 (milestone), E1 (epic), or E1.S2 (story)");
  output.blank();

  output.subheader("Examples:");
  console.log("  lisa status                        Project overview");
  console.log("  lisa status board                  Full kanban board");
  console.log("  lisa status board E1               Board filtered to Epic 1");
  console.log("  lisa status show E1.S3             Details for story E1.S3");
  console.log("  lisa status context                Full project context");
  console.log("  lisa status context E1 --full      Epic 1 context (untruncated)");
  console.log("  lisa status why E2.S1              Why does this story exist?");
  console.log("  lisa status how E1.S2              How to implement this story");
  output.blank();
}

function showDiscoverHelp(): void {
  output.header("lisa discover");
  console.log("Gather project context through guided discovery sessions.");
  output.blank();

  output.subheader("Usage:");
  console.log("  lisa discover [subcommand] [options]");
  output.blank();

  output.subheader("Subcommands:");
  console.log("  (none)              Start or continue discovery session");
  console.log("  init <name>         Initialize a new project");
  console.log("  status              Show discovery progress and gaps");
  console.log("  history             Show all discovery Q&A entries");
  console.log("  add-entry           Add a discovery entry (project-level)");
  console.log("  epic <id>           Start discovery for a specific epic");
  console.log("  milestone <id>      Start discovery for a milestone");
  console.log("  add-element-entry   Add entry to milestone/epic discovery");
  console.log("  complete-element    Complete milestone/epic discovery");
  output.blank();

  output.subheader("Discovery Depth Options:");
  console.log("  --quick             Essentials only (faster, less thorough)");
  console.log("  --standard          Balanced depth (default)");
  console.log("  --deep              Comprehensive discovery (more questions)");
  output.blank();

  output.subheader("Other Options:");
  console.log("  --help, -h          Show this help");
  output.blank();

  output.subheader("Add Entry Options (project-level):");
  console.log("  --category <cat>    Category: problem, vision, users, values,");
  console.log("                      constraints, success, other");
  console.log("  --question '<q>'    The discovery question");
  console.log("  --answer '<a>'      The answer/information gathered");
  output.blank();

  output.subheader("Add Element Entry Options (milestone/epic-level):");
  console.log("  --element-type      Type: milestone or epic");
  console.log("  --element-id        ID: M1, E1, etc.");
  console.log("  --category <cat>    Category: problem, vision, users, values,");
  console.log("                      constraints, success, other");
  console.log("  --question '<q>'    The discovery question");
  console.log("  --answer '<a>'      The answer/information gathered");
  output.blank();

  output.subheader("Examples:");
  console.log("  lisa discover init \"E-commerce Platform\"");
  console.log("  lisa discover                      Continue discovery");
  console.log("  lisa discover --deep               Deep discovery mode");
  console.log("  lisa discover status               Check progress");
  console.log("  lisa discover epic E1              Discover for Epic 1");
  console.log("  lisa discover milestone M1         Discover for Milestone 1");
  console.log("  lisa discover add-entry \\");
  console.log("    --category problem \\");
  console.log("    --question 'What problem are we solving?' \\");
  console.log("    --answer 'Users cannot track their orders'");
  console.log("  lisa discover add-element-entry \\");
  console.log("    --element-type milestone --element-id M1 \\");
  console.log("    --category success \\");
  console.log("    --question 'What are the success criteria for M1?' \\");
  console.log("    --answer 'Users can complete checkout flow'");
  console.log("  lisa discover complete-element \\");
  console.log("    --element-type milestone --element-id M1");
  output.blank();
}

function showPlanHelp(): void {
  output.header("lisa plan");
  console.log("Create and manage roadmap artifacts: milestones, epics, and stories.");
  output.blank();

  output.subheader("Usage:");
  console.log("  lisa plan [subcommand] [options]");
  output.blank();

  output.subheader("Subcommands:");
  console.log("  (none)              Show milestones (same as 'milestones')");
  console.log("  milestones          List all milestones");
  console.log("  add-milestone       Add a new milestone");
  console.log("  epics [M1]          List epics (optionally filter by milestone)");
  console.log("  add-epic            Add a new epic to a milestone");
  console.log("  epic <id>           View/plan a specific epic");
  console.log("  stories <id>        List stories for an epic");
  output.blank();

  output.subheader("Options:");
  console.log("  --help, -h          Show this help");
  output.blank();

  output.subheader("Add Milestone Options:");
  console.log("  --name '<name>'         Milestone name (required)");
  console.log("  --description '<desc>'  Milestone description (required)");
  output.blank();

  output.subheader("Add Epic Options:");
  console.log("  --milestone <M1>        Parent milestone ID (required)");
  console.log("  --name '<name>'         Epic name (required)");
  console.log("  --description '<desc>'  Epic description (required)");
  output.blank();

  output.subheader("Examples:");
  console.log("  lisa plan                          View milestones");
  console.log("  lisa plan milestones               Same as above");
  console.log("  lisa plan add-milestone \\");
  console.log("    --name 'MVP Launch' \\");
  console.log("    --description 'Core features for initial release'");
  console.log("  lisa plan epics                    View all epics");
  console.log("  lisa plan epics M1                 View epics in Milestone 1");
  console.log("  lisa plan add-epic \\");
  console.log("    --milestone M1 \\");
  console.log("    --name 'User Authentication' \\");
  console.log("    --description 'Login, signup, password reset'");
  console.log("  lisa plan epic E1                  View Epic 1 details");
  console.log("  lisa plan stories E1               View stories in Epic 1");
  output.blank();
}

function showFeedbackHelp(): void {
  output.header("lisa feedback");
  console.log("Track work progress and manage feedback items on stories.");
  output.blank();

  output.subheader("Usage:");
  console.log("  lisa feedback [subcommand] [options]");
  output.blank();

  output.subheader("Subcommands:");
  console.log("  (none)              List all pending feedback items");
  console.log("  mark <id> <status>  Update story status");
  console.log("  add <id>            Add feedback to a story");
  console.log("  resolve <fb-id>     Mark feedback as resolved");
  console.log("  dismiss <fb-id>     Dismiss feedback without action");
  output.blank();

  output.subheader("Story Statuses (for 'mark'):");
  console.log("  todo                Not started");
  console.log("  assigned            Assigned to someone");
  console.log("  in_progress         Work in progress");
  console.log("  review              In review");
  console.log("  done                Completed");
  console.log("  blocked             Blocked by dependency/issue");
  console.log("  deferred            Postponed to later");
  output.blank();

  output.subheader("Feedback Types (for 'add'):");
  console.log("  blocker             Something blocking progress");
  console.log("  gap                 Missing information or requirement");
  console.log("  scope               Scope change or clarification needed");
  console.log("  conflict            Conflicting requirements");
  console.log("  question            Question needing answer");
  output.blank();

  output.subheader("Options:");
  console.log("  --help, -h          Show this help");
  console.log("  --reason '<text>'   Reason for status change (mark)");
  console.log("  --type <type>       Feedback type (add)");
  console.log("  --message '<text>'  Feedback message (add)");
  console.log("  --resolution '<t>'  Resolution note (resolve)");
  output.blank();

  output.subheader("Examples:");
  console.log("  lisa feedback                      List pending feedback");
  console.log("  lisa feedback mark E1.S1 in_progress");
  console.log("  lisa feedback mark E1.S2 done --reason 'PR merged'");
  console.log("  lisa feedback mark E2.S1 blocked --reason 'Waiting on API'");
  console.log("  lisa feedback add E1.S3 \\");
  console.log("    --type blocker \\");
  console.log("    --message 'Missing API documentation'");
  console.log("  lisa feedback add E2.S1 \\");
  console.log("    --type question \\");
  console.log("    --message 'Should this support pagination?'");
  console.log("  lisa feedback resolve fb-abc123 \\");
  console.log("    --resolution 'Added pagination support'");
  console.log("  lisa feedback dismiss fb-xyz789");
  output.blank();
}

function showValidateHelp(): void {
  output.header("lisa validate");
  console.log("Check plan integrity, cross-references, and coverage.");
  output.blank();

  output.subheader("Usage:");
  console.log("  lisa validate [subcommand] [options]");
  output.blank();

  output.subheader("Subcommands:");
  console.log("  (none)              Run full validation suite");
  console.log("  links               Check all cross-references are valid");
  console.log("  coverage            Check requirement coverage by stories");
  console.log("  epic <id>           Validate a specific epic");
  output.blank();

  output.subheader("Options:");
  console.log("  --help, -h          Show this help");
  output.blank();

  output.subheader("What Gets Validated:");
  console.log("  • All story IDs reference valid epics");
  console.log("  • All epic IDs reference valid milestones");
  console.log("  • No orphaned or dangling references");
  console.log("  • Requirements have implementing stories");
  console.log("  • Stories have acceptance criteria");
  console.log("  • Epic scope is complete and consistent");
  output.blank();

  output.subheader("Examples:");
  console.log("  lisa validate                      Run all checks");
  console.log("  lisa validate links                Check references only");
  console.log("  lisa validate coverage             Check requirement coverage");
  console.log("  lisa validate epic E1              Validate Epic 1 only");
  console.log("  lisa validate E2                   Shorthand for 'epic E2'");
  output.blank();
}

function showCommandHelp(command: string): boolean {
  switch (command) {
    case "status":
      showStatusHelp();
      return true;
    case "discover":
      showDiscoverHelp();
      return true;
    case "plan":
      showPlanHelp();
      return true;
    case "feedback":
      showFeedbackHelp();
      return true;
    case "validate":
      showValidateHelp();
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Global help (no command)
  if (!args.command && (args.flags.help || args.flags.h || process.argv.length <= 2)) {
    showHelp();
    return;
  }

  // Command-specific help
  if (args.command && (args.flags.help || args.flags.h)) {
    if (showCommandHelp(args.command)) {
      return;
    }
    // Unknown command, fall through to show error
  }

  const engine = createEngine();

  try {
    switch (args.command) {
      // ======================================================================
      // Status Commands
      // ======================================================================
      case "status": {
        switch (args.subcommand) {
          case "board": {
            const result = await engine.status.board(args.positional[0]);
            handleResult(result);
            break;
          }
          case "show": {
            const storyId = args.positional[0];
            if (!storyId) {
              output.error("Usage: lisa status show <story-id>");
              process.exit(1);
            }
            const result = await engine.status.story(storyId);
            handleResult(result);
            break;
          }
          case "context": {
            const result = await engine.status.context({
              target: args.positional[0],
              full: Boolean(args.flags.full),
              format: args.flags.format === "json" ? "json" : "text",
            });
            handleResult(result);
            break;
          }
          case "why": {
            const storyId = args.positional[0];
            if (!storyId) {
              output.error("Usage: lisa status why <story-id>");
              process.exit(1);
            }
            const result = await engine.status.why(storyId);
            handleResult(result);
            break;
          }
          case "how": {
            const storyId = args.positional[0];
            if (!storyId) {
              output.error("Usage: lisa status how <story-id>");
              process.exit(1);
            }
            const result = await engine.status.how(storyId);
            handleResult(result);
            break;
          }
          default: {
            // Default: show overview
            const result = await engine.status.overview();
            handleResult(result);
            break;
          }
        }
        break;
      }

      // ======================================================================
      // Discovery Commands
      // ======================================================================
      case "discover": {
        switch (args.subcommand) {
          case "init": {
            const name = args.positional[0] || "Untitled Project";
            const result = await engine.discover.init(name);
            handleResult(result);
            break;
          }
          case "status": {
            const result = await engine.discover.status();
            handleResult(result);
            break;
          }
          case "history": {
            const result = await engine.discover.history();
            handleResult(result);
            break;
          }
          case "add-entry": {
            const category = args.flags.category as string;
            const question = args.flags.question as string;
            const answer = args.flags.answer as string;

            if (!category || !question || !answer) {
              output.error("Usage: lisa discover add-entry --category <cat> --question '<q>' --answer '<a>'");
              process.exit(1);
            }

            const result = await engine.discover.addEntry({
              category: category as any,
              question,
              answer,
            });
            handleResult(result);
            break;
          }
          case "epic":
          case "milestone": {
            const elementId = args.positional[0];
            if (!elementId) {
              output.error(`Usage: lisa discover ${args.subcommand} <id>`);
              process.exit(1);
            }
            const result = await engine.discover.element({
              elementType: args.subcommand as "epic" | "milestone",
              elementId,
            });
            handleResult(result);
            break;
          }
          case "add-element-entry": {
            const elementType = args.flags["element-type"] as string;
            const elementId = args.flags["element-id"] as string;
            const category = args.flags.category as string;
            const question = args.flags.question as string;
            const answer = args.flags.answer as string;

            if (!elementType || !elementId || !category || !question || !answer) {
              output.error("Usage: lisa discover add-element-entry --element-type <milestone|epic> --element-id <id> --category <cat> --question '<q>' --answer '<a>'");
              process.exit(1);
            }

            if (elementType !== "milestone" && elementType !== "epic") {
              output.error("Invalid element-type. Must be 'milestone' or 'epic'");
              process.exit(1);
            }

            const result = await engine.discover.addElementEntry({
              elementType: elementType as "milestone" | "epic",
              elementId,
              category: category as any,
              question,
              answer,
            });
            handleResult(result);
            break;
          }
          case "complete-element": {
            const elementType = args.flags["element-type"] as string;
            const elementId = args.flags["element-id"] as string;

            if (!elementType || !elementId) {
              output.error("Usage: lisa discover complete-element --element-type <milestone|epic> --element-id <id>");
              process.exit(1);
            }

            if (elementType !== "milestone" && elementType !== "epic") {
              output.error("Invalid element-type. Must be 'milestone' or 'epic'");
              process.exit(1);
            }

            const result = await engine.discover.completeElement({
              elementType: elementType as "milestone" | "epic",
              elementId,
            });
            handleResult(result);
            break;
          }
          default: {
            // Default: start/continue discovery
            let depth: DiscoveryDepth | undefined;
            if (args.flags.quick) depth = "quick";
            else if (args.flags.deep) depth = "deep";
            else if (args.flags.standard) depth = "standard";

            const result = await engine.discover.start({ depth });
            handleResult(result);
            break;
          }
        }
        break;
      }

      // ======================================================================
      // Plan Commands
      // ======================================================================
      case "plan": {
        switch (args.subcommand) {
          case "milestones": {
            const result = await engine.plan.milestones();
            handleResult(result);
            break;
          }
          case "add-milestone": {
            const name = args.flags.name as string;
            const description = args.flags.description as string;
            if (!name || !description) {
              output.error("Usage: lisa plan add-milestone --name '<name>' --description '<desc>'");
              process.exit(1);
            }
            const result = await engine.plan.addMilestone({ name, description });
            handleResult(result);
            break;
          }
          case "epics": {
            const result = await engine.plan.epics(args.positional[0]);
            handleResult(result);
            break;
          }
          case "add-epic": {
            const milestoneId = args.flags.milestone as string;
            const name = args.flags.name as string;
            const description = args.flags.description as string;
            if (!milestoneId || !name || !description) {
              output.error("Usage: lisa plan add-epic --milestone M1 --name '<name>' --description '<desc>'");
              process.exit(1);
            }
            const result = await engine.plan.addEpic({ milestoneId, name, description });
            handleResult(result);
            break;
          }
          case "epic": {
            const epicId = args.positional[0];
            if (!epicId) {
              output.error("Usage: lisa plan epic <E1>");
              process.exit(1);
            }
            const result = await engine.plan.epic(epicId);
            handleResult(result);
            break;
          }
          case "stories": {
            const epicId = args.positional[0];
            if (!epicId) {
              output.error("Usage: lisa plan stories <E1>");
              process.exit(1);
            }
            const result = await engine.plan.stories(epicId);
            handleResult(result);
            break;
          }
          case "savePrd": {
            const epicId = args.positional[0];
            const content = args.positional[1];
            if (!epicId || !content) {
              output.error("Usage: lisa plan savePrd <E1> '<prd-content>'");
              process.exit(1);
            }
            const result = await engine.plan.savePrd({ epicId, content });
            handleResult(result);
            break;
          }
          case "saveArchitecture": {
            const epicId = args.positional[0];
            const content = args.positional[1];
            if (!epicId || !content) {
              output.error("Usage: lisa plan saveArchitecture <E1> '<architecture-content>'");
              process.exit(1);
            }
            const result = await engine.plan.saveArchitecture({ epicId, content });
            handleResult(result);
            break;
          }
          case "saveStories": {
            const epicId = args.positional[0];
            const storiesJson = args.positional[1];
            if (!epicId || !storiesJson) {
              output.error("Usage: lisa plan saveStories <E1> '<stories-json>'");
              process.exit(1);
            }
            try {
              const stories = JSON.parse(storiesJson);
              const result = await engine.plan.saveStories({ epicId, stories });
              handleResult(result);
            } catch (e) {
              output.error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
              process.exit(1);
            }
            break;
          }
          default: {
            // Default: show milestones
            const result = await engine.plan.milestones();
            handleResult(result);
            break;
          }
        }
        break;
      }

      // ======================================================================
      // Feedback Commands
      // ======================================================================
      case "feedback": {
        switch (args.subcommand) {
          case "mark": {
            const storyId = args.positional[0];
            const status = args.positional[1] as StoryStatus;
            const reason = args.flags.reason as string | undefined;

            if (!storyId || !status) {
              output.error("Usage: lisa feedback mark <E1.S2> <status> [--reason '...']");
              output.dim("  Statuses: todo, assigned, in_progress, review, done, blocked, deferred");
              process.exit(1);
            }

            const validStatuses: StoryStatus[] = ["todo", "assigned", "in_progress", "review", "done", "blocked", "deferred"];
            if (!validStatuses.includes(status)) {
              output.error(`Invalid status: ${status}`);
              output.dim(`  Valid: ${validStatuses.join(", ")}`);
              process.exit(1);
            }

            const result = await engine.feedback.mark({ storyId, status, reason });
            handleResult(result);
            break;
          }
          case "add": {
            const storyId = args.positional[0];
            const type = args.flags.type as FeedbackType;
            const message = args.flags.message as string;

            if (!storyId || !type || !message) {
              output.error("Usage: lisa feedback add <E1.S2> --type <type> --message '...'");
              output.dim("  Types: blocker, gap, scope, conflict, question");
              process.exit(1);
            }

            const validTypes: FeedbackType[] = ["blocker", "gap", "scope", "conflict", "question"];
            if (!validTypes.includes(type)) {
              output.error(`Invalid type: ${type}`);
              output.dim(`  Valid: ${validTypes.join(", ")}`);
              process.exit(1);
            }

            const result = await engine.feedback.add({ storyId, type, message });
            handleResult(result);
            break;
          }
          case "resolve": {
            const feedbackId = args.positional[0];
            const resolution = args.flags.resolution as string | undefined;

            if (!feedbackId) {
              output.error("Usage: lisa feedback resolve <fb-xxx> [--resolution '...']");
              process.exit(1);
            }

            const result = await engine.feedback.resolve({ feedbackId, resolution });
            handleResult(result);
            break;
          }
          case "dismiss": {
            const feedbackId = args.positional[0];

            if (!feedbackId) {
              output.error("Usage: lisa feedback dismiss <fb-xxx>");
              process.exit(1);
            }

            const result = await engine.feedback.dismiss(feedbackId);
            handleResult(result);
            break;
          }
          default: {
            // Default: list feedback
            const result = await engine.feedback.list();
            handleResult(result);
            break;
          }
        }
        break;
      }

      // ======================================================================
      // Validate Commands
      // ======================================================================
      case "validate": {
        switch (args.subcommand) {
          case "links": {
            const result = await engine.validate.links();
            handleResult(result);
            break;
          }
          case "coverage": {
            const result = await engine.validate.coverage();
            handleResult(result);
            break;
          }
          case "epic": {
            const epicId = args.positional[0];
            if (!epicId) {
              output.error("Usage: lisa validate epic <E1>");
              process.exit(1);
            }
            const result = await engine.validate.epic(epicId);
            handleResult(result);
            break;
          }
          default: {
            // Check if subcommand looks like an epic ID
            if (args.subcommand && args.subcommand.match(/^E\d+$/)) {
              const result = await engine.validate.epic(args.subcommand);
              handleResult(result);
            } else {
              // Default: full validation
              const result = await engine.validate.all();
              handleResult(result);
            }
            break;
          }
        }
        break;
      }

      // ======================================================================
      // Unknown Command
      // ======================================================================
      default: {
        output.error(`Unknown command: ${args.command}`);
        output.info("Run 'lisa --help' for usage information.");
        process.exit(1);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      output.error(err.message);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
    } else {
      output.error(String(err));
    }
    process.exit(1);
  }
}

main();
