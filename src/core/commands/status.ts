/**
 * Status Commands for Lisa Engine
 *
 * View project state, story details, and navigate artifacts.
 */

import { StateManager } from "../state.js";
import {
  CommandResult,
  OutputSection,
  success,
  error,
  section,
} from "../types.js";
import {
  parseStoryId,
  statusIcon,
  statusCategory,
  timeAgo,
  truncate,
} from "../utils.js";
import { Story, StoryStatus, DerivedEpicStatus } from "../schemas.js";
import {
  getOverviewGuidance,
  getBoardGuidance,
  getStoryGuidance,
  getContextGuidance,
  getWhyGuidance,
  getHowGuidance,
} from "../prompts/status.js";
import { getNotInitializedGuidance } from "../prompts/discovery.js";

// ============================================================================
// Types
// ============================================================================

export interface OverviewData {
  project: {
    name: string;
    status: string;
    updated: string;
    currentFocus?: string;
    stats: {
      milestones: number;
      epics: number;
      stories: number;
      completedStories: number;
    };
  };
  milestones: Array<{
    id: string;
    name: string;
    totalStories: number;
    completedStories: number;
    progress: number;
  }>;
  epics: Array<{
    id: string;
    name: string;
    status: DerivedEpicStatus;
  }>;
  queues: {
    stuckCount: number;
    feedbackCount: number;
  };
}

export interface BoardData {
  columns: Record<StoryStatus, Array<Story & { epicName: string }>>;
  blocked: Array<Story & { epicName: string }>;
  deferred: Array<Story & { epicName: string }>;
}

export interface StoryData {
  story: Story;
  epicName: string;
}

// ============================================================================
// Overview Command
// ============================================================================

export async function overview(state: StateManager): Promise<CommandResult<OverviewData | null>> {
  if (!(await state.isInitialized())) {
    const sections: OutputSection[] = [
      section.info("No Lisa project found in this directory."),
      section.blank(),
      section.info("Run 'discover init' to start planning."),
    ];
    return success(null, sections, getNotInitializedGuidance());
  }

  const project = await state.readProject();
  const index = await state.readMilestoneIndex();
  const feedbackQueue = await state.readFeedbackQueue();
  const stuckQueue = await state.readStuckQueue();

  if (!project) {
    return error("Project not found.", "NOT_FOUND");
  }

  // Build milestone data with progress
  const milestones: OverviewData["milestones"] = [];
  let totalStoriesCount = 0;
  let completedStoriesCount = 0;
  if (index) {
    for (const m of index.milestones) {
      let totalStories = 0;
      let completedStories = 0;

      for (const epicId of m.epics) {
        const epicDirs = await state.listEpicDirs();
        const epicDir = epicDirs.find((d) => d.startsWith(`${epicId}-`));
        if (epicDir) {
          const slug = epicDir.split("-").slice(1).join("-");
          const stories = await state.readStories(epicId, slug);
          if (stories) {
            totalStories += stories.stories.length;
            completedStories += stories.stories.filter((s) => s.status === "done").length;
          }
        }
      }

      totalStoriesCount += totalStories;
      completedStoriesCount += completedStories;

      milestones.push({
        id: m.id,
        name: m.name,
        totalStories,
        completedStories,
        progress: totalStories > 0 ? completedStories / totalStories : 0,
      });
    }
  }

  // Build epic data
  const epics: OverviewData["epics"] = [];
  const epicDirs = await state.listEpicDirs();
  for (const epicDir of epicDirs) {
    const [epicId] = epicDir.split("-");
    const slug = epicDir.split("-").slice(1).join("-");
    const epicWithStatus = await state.getEpicWithStatus(epicId, slug);
    if (epicWithStatus) {
      epics.push({
        id: epicWithStatus.epic.id,
        name: epicWithStatus.epic.name,
        status: epicWithStatus.status,
      });
    }
  }

  const data: OverviewData = {
    project: {
      name: project.name,
      status: project.status,
      updated: project.updated,
      currentFocus: project.current_focus,
      stats: {
        milestones: milestones.length,
        epics: epics.length,
        stories: totalStoriesCount,
        completedStories: completedStoriesCount,
      },
    },
    milestones,
    epics,
    queues: {
      stuckCount: stuckQueue?.stuck.length || 0,
      feedbackCount: feedbackQueue?.feedback.filter((f) => f.status === "pending").length || 0,
    },
  };

  // Build output sections
  const sections: OutputSection[] = [
    section.header("Lisa Status"),
    section.subheader(`Project: ${project.name}`),
    section.dim(`  Status: ${project.status}`),
    section.dim(`  Updated: ${timeAgo(project.updated)}`),
  ];

  if (project.current_focus) {
    sections.push(section.dim(`  Focus: ${project.current_focus}`));
  }
  sections.push(section.blank());

  // Milestones
  if (milestones.length > 0) {
    sections.push(section.subheader("Milestones"));
    for (const m of milestones) {
      const percent = Math.round(m.progress * 100);
      sections.push({
        type: "progress",
        content: {
          current: m.completedStories,
          total: m.totalStories,
          label: `${m.id} ${m.name}`,
          percent,
        },
      });
    }
    sections.push(section.blank());
  }

  // Epics
  if (epics.length > 0) {
    sections.push(section.subheader("Epics"));
    for (const epic of epics) {
      const icon = statusIcon(epic.status);
      sections.push({
        type: "status",
        content: {
          icon,
          text: `${epic.id}: ${epic.name}`,
          status: epic.status,
          category: statusCategory(epic.status),
        },
      });
    }
    sections.push(section.blank());
  }

  // Attention needed
  if (data.queues.stuckCount > 0 || data.queues.feedbackCount > 0) {
    sections.push(section.subheader("Attention Needed"));
    if (data.queues.stuckCount > 0) {
      sections.push(section.warning(`${data.queues.stuckCount} blocked item(s) need resolution`));
    }
    if (data.queues.feedbackCount > 0) {
      sections.push(section.info(`${data.queues.feedbackCount} feedback item(s) pending`));
    }
    sections.push(section.blank());
  }

  // Stats
  sections.push(section.subheader("Stats"));
  sections.push(section.text(`  Milestones: ${data.project.stats.milestones}`));
  sections.push(section.text(`  Epics: ${data.project.stats.epics}`));
  sections.push(section.text(`  Stories: ${data.project.stats.stories}`));
  sections.push(
    section.text(`  Completed: ${data.project.stats.completedStories}/${data.project.stats.stories}`)
  );

  // Check for blocked stories
  let hasBlockedStories = false;
  for (const epicDir of epicDirs) {
    const [epicId] = epicDir.split("-");
    const slug = epicDir.split("-").slice(1).join("-");
    const storiesFile = await state.readStories(epicId, slug);
    if (storiesFile?.stories.some((s) => s.status === "blocked")) {
      hasBlockedStories = true;
      break;
    }
  }

  const aiGuidance = getOverviewGuidance({
    projectStatus: project.status,
    milestonesCount: data.project.stats.milestones,
    epicsCount: data.project.stats.epics,
    storiesTotal: data.project.stats.stories,
    storiesCompleted: data.project.stats.completedStories,
    stuckCount: data.queues.stuckCount,
    feedbackCount: data.queues.feedbackCount,
    hasBlockedStories,
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Board Command
// ============================================================================

export async function board(
  state: StateManager,
  options: { epicFilter?: string } = {}
): Promise<CommandResult<BoardData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  // Collect all stories
  const allStories: (Story & { epicName: string })[] = [];
  const epicDirs = await state.listEpicDirs();

  for (const epicDir of epicDirs) {
    const [epicId] = epicDir.split("-");
    if (options.epicFilter && epicId !== options.epicFilter) continue;

    const slug = epicDir.split("-").slice(1).join("-");
    const epic = await state.readEpic(epicId, slug);
    const storiesFile = await state.readStories(epicId, slug);

    if (storiesFile && epic) {
      for (const story of storiesFile.stories) {
        allStories.push({ ...story, epicName: epic.name });
      }
    }
  }

  // Group by status
  const columns: BoardData["columns"] = {
    todo: [],
    assigned: [],
    in_progress: [],
    review: [],
    done: [],
    blocked: [],
    deferred: [],
  };

  for (const story of allStories) {
    columns[story.status].push(story);
  }

  const data: BoardData = {
    columns,
    blocked: columns.blocked,
    deferred: columns.deferred,
  };

  // Build sections
  const sections: OutputSection[] = [section.header("Lisa Board")];

  if (allStories.length === 0) {
    sections.push(section.info("No stories found."));
    return success(data, sections);
  }

  // Visible columns for the board
  const visibleStatuses: StoryStatus[] = ["todo", "in_progress", "review", "done"];
  const headers = visibleStatuses.map((s) => s.toUpperCase());

  // Build rows for table
  const maxRows = Math.max(...visibleStatuses.map((s) => columns[s].length), 1);
  const rows: string[][] = [];

  for (let row = 0; row < maxRows; row++) {
    const cells = visibleStatuses.map((status) => {
      const story = columns[status][row];
      return story ? truncate(story.id, 16) : "";
    });
    rows.push(cells);
  }

  sections.push(section.table(rows, headers));

  // Blocked section
  if (columns.blocked.length > 0) {
    sections.push(section.blank());
    sections.push(section.warning(`BLOCKED (${columns.blocked.length}):`));
    for (const story of columns.blocked) {
      sections.push(section.error(`  ${story.id}: ${story.blocked_reason || "No reason"}`));
    }
  }

  // Deferred section
  if (columns.deferred.length > 0) {
    sections.push(section.blank());
    sections.push(section.dim(`DEFERRED (${columns.deferred.length}):`));
    for (const story of columns.deferred) {
      sections.push(section.dim(`  ${story.id}: ${story.title}`));
    }
  }

  const aiGuidance = getBoardGuidance({
    todoCount: columns.todo.length,
    inProgressCount: columns.in_progress.length,
    reviewCount: columns.review.length,
    doneCount: columns.done.length,
    blockedCount: columns.blocked.length,
    blockedStories: columns.blocked.map((s) => ({ id: s.id, reason: s.blocked_reason })),
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Story Command
// ============================================================================

export async function story(
  state: StateManager,
  options: { storyId: string }
): Promise<CommandResult<StoryData>> {
  const parsed = parseStoryId(options.storyId);
  if (!parsed) {
    return error(`Invalid story ID: ${options.storyId}`, "INVALID_ID");
  }

  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${parsed.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${parsed.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const epic = await state.readEpic(parsed.epicId, slug);
  const storiesFile = await state.readStories(parsed.epicId, slug);

  if (!storiesFile) {
    return error("Stories not found.", "NOT_FOUND");
  }

  const storyData = storiesFile.stories.find((s) => s.id === options.storyId);
  if (!storyData) {
    return error(`Story ${options.storyId} not found.`, "NOT_FOUND");
  }

  const data: StoryData = {
    story: storyData,
    epicName: epic?.name || parsed.epicId,
  };

  // Build sections
  const sections: OutputSection[] = [
    section.header(`Story: ${storyData.id}`),
    section.subheader(storyData.title),
    section.blank(),
    section.text(`  Epic: ${data.epicName}`),
    {
      type: "status",
      content: {
        text: `Status: ${storyData.status}`,
        status: storyData.status,
        category: statusCategory(storyData.status),
      },
    },
    section.text(`  Type: ${storyData.type}`),
  ];

  if (storyData.assignee) {
    sections.push(section.text(`  Assignee: ${storyData.assignee}`));
  }
  if (storyData.estimated_points) {
    sections.push(section.text(`  Points: ${storyData.estimated_points}`));
  }
  sections.push(section.blank());

  // Description
  sections.push(section.subheader("Description"));
  sections.push(section.text(`  ${storyData.description}`));
  sections.push(section.blank());

  // Acceptance criteria
  sections.push(section.subheader("Acceptance Criteria"));
  for (const ac of storyData.acceptance_criteria) {
    sections.push(section.text(`  [ ] ${ac}`));
  }
  sections.push(section.blank());

  // Requirements
  if (storyData.requirements.length > 0) {
    sections.push(section.subheader("Requirements"));
    for (const req of storyData.requirements) {
      sections.push(section.text(`  ${req}`));
    }
    sections.push(section.blank());
  }

  // Dependencies
  if (storyData.dependencies.length > 0) {
    sections.push(section.subheader("Dependencies"));
    for (const dep of storyData.dependencies) {
      sections.push(section.text(`  ${dep}`));
    }
    sections.push(section.blank());
  }

  if (storyData.blocked_reason) {
    sections.push(section.warning(`Blocked: ${storyData.blocked_reason}`));
  }

  // Check if dependencies are complete
  const hasDependencies = storyData.dependencies.length > 0;
  let dependenciesComplete = true;
  if (hasDependencies) {
    for (const depId of storyData.dependencies) {
      const dep = storiesFile.stories.find((s) => s.id === depId);
      if (dep && dep.status !== "done") {
        dependenciesComplete = false;
        break;
      }
    }
  }

  const aiGuidance = getStoryGuidance({
    story: storyData,
    epicName: data.epicName,
    hasDependencies,
    dependenciesComplete,
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Context Command
// ============================================================================

export async function context(
  state: StateManager,
  options: { target?: string; full?: boolean; format?: "text" | "json" } = {}
): Promise<CommandResult<unknown>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const { target, full, format } = options;

  // No target: project context
  if (!target) {
    const ctx = await state.assembleProjectContext();

    if (format === "json") {
      return success(ctx, [{ type: "text", content: JSON.stringify(ctx, null, 2) }]);
    }

    const sections: OutputSection[] = [
      section.header("Project Context"),
      section.subheader("PROJECT"),
      section.text(`  Name: ${ctx.project.name}`),
      section.text(`  Status: ${ctx.project.status}`),
    ];

    if (ctx.project.description) {
      sections.push(section.text(`  Description: ${ctx.project.description}`));
    }
    sections.push(section.blank());

    if (ctx.discovery) {
      sections.push(section.subheader("DISCOVERY"));
      if (ctx.discovery.problem) {
        sections.push(section.text(`  Problem: ${ctx.discovery.problem}`));
      }
      if (ctx.discovery.vision) {
        sections.push(section.text(`  Vision: ${ctx.discovery.vision}`));
      }
      if (ctx.discovery.values && ctx.discovery.values.length > 0) {
        sections.push(section.dim("  Values:"));
        for (const v of ctx.discovery.values) {
          sections.push(section.text(`    - ${v.name}: ${v.description}`));
        }
      }
      sections.push(section.blank());
    }

    if (ctx.constraints && ctx.constraints.constraints.length > 0) {
      sections.push(section.subheader("CONSTRAINTS"));
      for (const c of ctx.constraints.constraints) {
        sections.push(section.text(`  [${c.type}] ${c.constraint}`));
        if (c.reason) {
          sections.push(section.dim(`    Reason: ${c.reason}`));
        }
      }
      sections.push(section.blank());
    }

    const aiGuidance = getContextGuidance(target);
    return success(ctx, sections, aiGuidance);
  }

  // Milestone context: M1, M2, etc.
  if (target.match(/^M\d+$/)) {
    try {
      const ctx = await state.assembleMilestoneContext(target);

      if (format === "json") {
        return success(ctx, [{ type: "text", content: JSON.stringify(ctx, null, 2) }]);
      }

      const sections: OutputSection[] = [
        section.header(`Milestone Context: ${target}`),
        section.subheader("MILESTONE"),
        section.text(`  ID: ${ctx.milestone.id}`),
        section.text(`  Name: ${ctx.milestone.name}`),
        section.text(`  Description: ${ctx.milestone.description}`),
        section.blank(),
      ];

      if (ctx.siblingEpics.length > 0) {
        sections.push(section.subheader("EPICS IN MILESTONE"));
        for (const epic of ctx.siblingEpics) {
          sections.push(section.text(`  ${epic.id}: ${epic.name}`));
          sections.push(section.dim(`    ${epic.description}`));
        }
        sections.push(section.blank());
      }

      sections.push(section.subheader("INHERITED: PROJECT CONTEXT"));
      sections.push(section.text(`  Project: ${ctx.project.project.name}`));
      if (ctx.project.discovery?.problem) {
        sections.push(section.dim(`  Problem: ${ctx.project.discovery.problem}`));
      }

      const aiGuidance = getContextGuidance(target);
      return success(ctx, sections, aiGuidance);
    } catch (err) {
      return error(err instanceof Error ? err.message : "Unknown error", "NOT_FOUND");
    }
  }

  // Epic context: E1, E2, etc.
  if (target.match(/^E\d+$/)) {
    try {
      const ctx = await state.assembleEpicContext(target);

      if (format === "json") {
        return success(ctx, [{ type: "text", content: JSON.stringify(ctx, null, 2) }]);
      }

      const sections: OutputSection[] = [
        section.header(`Epic Context: ${target}`),
        section.subheader("EPIC"),
        section.text(`  ID: ${ctx.epic.id}`),
        section.text(`  Name: ${ctx.epic.name}`),
        section.text(`  Description: ${ctx.epic.description}`),
        section.text(`  Milestone: ${ctx.milestone.id} (${ctx.milestone.name})`),
        section.blank(),
        section.subheader("ARTIFACTS"),
      ];

      const prdStatus =
        ctx.epic.artifacts.prd.status === "complete"
          ? `✓ PRD (v${ctx.epic.artifacts.prd.version})`
          : `○ PRD [${ctx.epic.artifacts.prd.status}]`;
      const archStatus =
        ctx.epic.artifacts.architecture.status === "complete"
          ? `✓ Architecture (v${ctx.epic.artifacts.architecture.version})`
          : `○ Architecture [${ctx.epic.artifacts.architecture.status}]`;
      const storiesStatus =
        ctx.epic.artifacts.stories.status === "complete"
          ? `✓ Stories (${ctx.epic.artifacts.stories.count})`
          : `○ Stories [${ctx.epic.artifacts.stories.status}]`;

      sections.push(section.text(`  ${prdStatus}`));
      sections.push(section.text(`  ${archStatus}`));
      sections.push(section.text(`  ${storiesStatus}`));
      sections.push(section.blank());

      if (ctx.dependencies.length > 0) {
        sections.push(section.subheader("EPIC DEPENDENCIES"));
        for (const dep of ctx.dependencies) {
          sections.push(section.text(`  ${dep.id}: ${dep.name}`));
        }
        sections.push(section.blank());
      }

      sections.push(section.subheader("INHERITED CONTEXT"));
      sections.push(section.text(`  Milestone: ${ctx.milestone.id} - ${ctx.milestone.name}`));
      sections.push(section.text(`  Project: ${ctx.project.project.name}`));

      const aiGuidance = getContextGuidance(target);
      return success(ctx, sections, aiGuidance);
    } catch (err) {
      return error(err instanceof Error ? err.message : "Unknown error", "NOT_FOUND");
    }
  }

  // Story context: E1.S2, etc.
  if (target.match(/^E\d+\.S\d+$/)) {
    try {
      const ctx = await state.assembleStoryContext(target.split(".")[0]);
      const storyId = target;

      // Find the specific story
      const epicDirs = await state.listEpicDirs();
      const parsed = parseStoryId(storyId);
      if (!parsed) {
        return error(`Invalid story ID: ${storyId}`, "INVALID_ID");
      }

      const epicDir = epicDirs.find((d) => d.startsWith(`${parsed.epicId}-`));
      if (!epicDir) {
        return error(`Epic ${parsed.epicId} not found.`, "NOT_FOUND");
      }

      const slug = epicDir.split("-").slice(1).join("-");
      const storiesFile = await state.readStories(parsed.epicId, slug);
      const storyData = storiesFile?.stories.find((s) => s.id === storyId);

      if (!storyData) {
        return error(`Story ${storyId} not found.`, "NOT_FOUND");
      }

      const fullData = { ...ctx, story: storyData };

      if (format === "json") {
        return success(fullData, [{ type: "text", content: JSON.stringify(fullData, null, 2) }]);
      }

      const sections: OutputSection[] = [
        section.header(`Context: ${storyId}`),
        section.subheader("STORY"),
        section.text(`Title: ${storyData.title}`),
        section.text(`Description: ${storyData.description}`),
        section.blank(),
        section.subheader("Acceptance Criteria"),
      ];

      for (const ac of storyData.acceptance_criteria) {
        sections.push(section.text(`- ${ac}`));
      }
      sections.push(section.blank());

      // Architecture context (truncated unless full)
      sections.push(section.subheader("ARCHITECTURE"));
      if (full) {
        sections.push(section.text(ctx.architecture));
      } else {
        const archPreview = ctx.architecture.slice(0, 500);
        sections.push(section.text(archPreview));
        if (ctx.architecture.length > 500) {
          sections.push(section.dim("...(use --full for complete architecture)"));
        }
      }

      const aiGuidance = getContextGuidance(target);
      return success(fullData, sections, aiGuidance);
    } catch (err) {
      return error(err instanceof Error ? err.message : "Unknown error", "NOT_FOUND");
    }
  }

  return error(
    "Usage: status context [M1|E1|E1.S2] [--full] [--format json]",
    "INVALID_ARGS"
  );
}

// ============================================================================
// Why Command (Story Lineage)
// ============================================================================

export async function why(
  state: StateManager,
  options: { storyId: string }
): Promise<CommandResult<unknown>> {
  const parsed = parseStoryId(options.storyId);
  if (!parsed) {
    return error(`Invalid story ID: ${options.storyId}`, "INVALID_ID");
  }

  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${parsed.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${parsed.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const epic = await state.readEpic(parsed.epicId, slug);
  const storiesFile = await state.readStories(parsed.epicId, slug);
  const discoveryContext = await state.readDiscoveryContext();
  const index = await state.readMilestoneIndex();
  const epicDiscovery = await state.readEpicDiscovery(parsed.epicId, slug);

  if (!storiesFile) {
    return error("Stories not found.", "NOT_FOUND");
  }

  const storyData = storiesFile.stories.find((s) => s.id === options.storyId);
  if (!storyData) {
    return error(`Story ${options.storyId} not found.`, "NOT_FOUND");
  }

  const data = {
    story: storyData,
    epic,
    epicDiscovery,
    milestone: epic ? index?.milestones.find((m) => m.id === epic.milestone) : null,
    project: discoveryContext,
  };

  const sections: OutputSection[] = [
    section.header(`Why: ${storyData.id}`),
    section.subheader(`${storyData.id} exists because:`),
    section.blank(),
  ];

  // Requirements
  if (storyData.requirements.length > 0) {
    sections.push(section.dim("Requirements:"));
    for (const req of storyData.requirements) {
      sections.push(section.text(`  → ${req}`));
    }
    sections.push(section.blank());
  }

  // Epic
  if (epic) {
    sections.push(section.dim("Epic:"));
    sections.push(section.text(`  → ${epic.id}: ${epic.name}`));
    sections.push(section.dim(`     "${epic.description}"`));
    sections.push(section.blank());

    // Epic Discovery
    if (epicDiscovery && epicDiscovery.status !== "skipped" && epicDiscovery.status !== "not_started") {
      sections.push(section.dim("Epic Discovery Context:"));
      if (epicDiscovery.problem) {
        sections.push(section.text(`  Problem: "${epicDiscovery.problem}"`));
      }
      if (epicDiscovery.scope.length > 0) {
        sections.push(section.text(`  Scope: ${epicDiscovery.scope.join("; ")}`));
      }
      sections.push(section.blank());
    }

    // Milestone
    if (data.milestone) {
      sections.push(section.dim("Milestone:"));
      sections.push(section.text(`  → ${data.milestone.id}: ${data.milestone.name}`));
      sections.push(section.dim(`     "${data.milestone.description}"`));
      sections.push(section.blank());
    }
  }

  // Project context
  if (discoveryContext) {
    sections.push(section.dim("Project Context:"));
    if (discoveryContext.problem) {
      sections.push(section.text(`  Problem: "${discoveryContext.problem}"`));
    }
    if (discoveryContext.values && discoveryContext.values.length > 0) {
      const topValue = discoveryContext.values[0];
      sections.push(section.text(`  Top Value: ${topValue.name} - "${topValue.description}"`));
    }
  }

  const aiGuidance = getWhyGuidance(options.storyId);
  return success(data, sections, aiGuidance);
}

// ============================================================================
// How Command (Implementation Guidance)
// ============================================================================

export async function how(
  state: StateManager,
  options: { storyId: string }
): Promise<CommandResult<unknown>> {
  const parsed = parseStoryId(options.storyId);
  if (!parsed) {
    return error(`Invalid story ID: ${options.storyId}`, "INVALID_ID");
  }

  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${parsed.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${parsed.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const storiesFile = await state.readStories(parsed.epicId, slug);
  const arch = await state.readArchitecture(parsed.epicId, slug);
  const config = await state.readConfig();

  if (!storiesFile) {
    return error("Stories not found.", "NOT_FOUND");
  }

  const storyData = storiesFile.stories.find((s) => s.id === options.storyId);
  if (!storyData) {
    return error(`Story ${options.storyId} not found.`, "NOT_FOUND");
  }

  const data = {
    story: storyData,
    architecture: arch,
    config,
  };

  const sections: OutputSection[] = [
    section.header(`How: ${storyData.id}`),
    section.subheader("Implementation Guidance"),
    section.blank(),
    section.text(`Title: ${storyData.title}`),
    section.text(`Type: ${storyData.type}`),
    section.blank(),
    section.subheader("Implementation Checklist"),
  ];

  for (const ac of storyData.acceptance_criteria) {
    sections.push(section.text(`[ ] ${ac}`));
  }
  sections.push(section.blank());

  // Architecture
  if (arch) {
    sections.push(section.subheader("Architecture Reference"));
    const archPreview = arch.slice(0, 1000);
    sections.push(section.text(archPreview));
    if (arch.length > 1000) {
      sections.push(section.dim("...(see architecture.md for full details)"));
    }
    sections.push(section.blank());
  }

  // Stack context
  if (config?.stack) {
    sections.push(section.subheader("Stack Context"));
    for (const [key, value] of Object.entries(config.stack)) {
      sections.push(section.text(`  ${key}: ${value}`));
    }
    sections.push(section.blank());
  }

  // Dependencies
  if (storyData.dependencies.length > 0) {
    sections.push(section.subheader("Dependencies (must be done first)"));
    for (const depId of storyData.dependencies) {
      const dep = storiesFile.stories.find((s) => s.id === depId);
      if (dep) {
        const icon = statusIcon(dep.status);
        sections.push({
          type: "status",
          content: {
            icon,
            text: `${dep.id}: ${dep.title}`,
            status: dep.status,
            category: statusCategory(dep.status),
          },
        });
      }
    }
  }

  const aiGuidance = getHowGuidance(options.storyId, !!arch);
  return success(data, sections, aiGuidance);
}
