/**
 * Plan Commands for Lisa Engine
 *
 * Generates milestones, epics, and artifacts (PRD, architecture, stories).
 */

import { StateManager } from "../state.js";
import {
  CommandResult,
  OutputSection,
  AIGuidance,
  success,
  error,
  section,
} from "../types.js";
import { now, slugify, statusIcon, statusCategory } from "../utils.js";
import {
  Milestone,
  Epic,
  Story,
  StoriesFile,
  DerivedEpicStatus,
  DerivedMilestoneStatus,
} from "../schemas.js";
import {
  getMilestonesGuidance,
  getEpicsGuidance,
  getEpicPlanningGuidance,
  getStoriesGuidance,
} from "../prompts/planning.js";

// ============================================================================
// Types
// ============================================================================

export interface MilestonesData {
  milestones: Array<Milestone & { status: DerivedMilestoneStatus }>;
  discoveryComplete: boolean;
}

export interface EpicsData {
  milestoneId?: string;
  milestone?: Milestone;
  epics: Array<{ epic: Epic; status: DerivedEpicStatus }>;
  hasEpics: boolean;
}

export interface EpicPlanningData {
  epic: Epic;
  status: DerivedEpicStatus;
  milestone: Milestone;
  artifacts: {
    prd: { status: string; exists: boolean };
    architecture: { status: string; exists: boolean };
    stories: { status: string; count: number };
  };
  nextStep: "prd" | "architecture" | "stories" | "complete";
}

export interface StoriesData {
  epicId: string;
  epicName: string;
  stories: Story[];
  requirements: Array<{ id: string; title: string }>;
}

// ============================================================================
// Milestones Commands
// ============================================================================

export async function showMilestones(state: StateManager): Promise<CommandResult<MilestonesData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const index = await state.readMilestoneIndex();
  const context = await state.readDiscoveryContext();
  const history = await state.readDiscoveryHistory();

  const discoveryComplete = history?.is_complete || false;

  const sections: OutputSection[] = [section.header("Milestones")];

  // Check discovery status
  if (!discoveryComplete) {
    sections.push(section.warning("Discovery is not complete. Complete discovery first."));
    sections.push(section.dim("  Run: discover"));

    return success(
      {
        milestones: [],
        approved: false,
        discoveryComplete: false,
      },
      sections
    );
  }

  // Show context summary
  sections.push(section.subheader("Project Context"));
  if (context?.problem) {
    sections.push(section.dim(`  Problem: ${context.problem.slice(0, 80)}...`));
  }
  if (context?.vision) {
    sections.push(section.dim(`  Vision: ${context.vision.slice(0, 80)}...`));
  }
  sections.push(section.blank());

  if (!index?.milestones || index.milestones.length === 0) {
    sections.push(section.info("No milestones defined yet."));

    const aiGuidance = getMilestonesGuidance(context, null);
    return success(
      { milestones: [], discoveryComplete: true },
      sections,
      aiGuidance
    );
  }

  // Build milestones with status
  const milestonesWithStatus: MilestonesData["milestones"] = [];
  for (const m of index.milestones) {
    const { status } = await state.getMilestoneWithStatus(m);
    milestonesWithStatus.push({ ...m, status });
  }

  // Show existing milestones
  sections.push(section.subheader("Current Milestones"));
  sections.push(section.blank());

  for (const m of milestonesWithStatus) {
    const icon = statusIcon(m.status);
    sections.push({
      type: "status",
      content: {
        icon,
        text: `${m.id}: ${m.name} [${m.status}]`,
        status: m.status,
        category: statusCategory(m.status),
      },
    });
    sections.push(section.dim(`     ${m.description}`));
    if (m.epics.length > 0) {
      sections.push(section.dim(`     Epics: ${m.epics.join(", ")}`));
    }
  }

  sections.push(section.blank());
  sections.push(section.info("Next: Generate epics with 'plan epics M1'"));

  const data: MilestonesData = {
    milestones: milestonesWithStatus,
    discoveryComplete: true,
  };

  const aiGuidance = getMilestonesGuidance(context, index);

  return success(data, sections, aiGuidance);
}

export async function addMilestone(
  state: StateManager,
  options: { name: string; description: string }
): Promise<CommandResult<{ milestone: Milestone }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  let index = await state.readMilestoneIndex();
  if (!index) {
    index = { milestones: [] };
  }

  const milestoneNum = index.milestones.length + 1;
  const milestone: Milestone = {
    id: `M${milestoneNum}`,
    slug: slugify(options.name),
    name: options.name,
    description: options.description,
    order: milestoneNum,
    epics: [],
    created: now(),
    updated: now(),
  };

  index.milestones.push(milestone);
  await state.writeMilestoneIndex(index);

  const sections: OutputSection[] = [
    section.success(`Added milestone ${milestone.id}: ${options.name}`),
  ];

  return success({ milestone }, sections);
}

// ============================================================================
// Epics Commands
// ============================================================================

export async function showEpics(
  state: StateManager,
  options: { milestoneId?: string } = {}
): Promise<CommandResult<EpicsData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const index = await state.readMilestoneIndex();

  if (!index?.milestones || index.milestones.length === 0) {
    return error("No milestones found. Add milestones first.", "NO_MILESTONES");
  }

  let targetMilestone: Milestone | undefined;
  if (options.milestoneId) {
    targetMilestone = index.milestones.find((m) => m.id === options.milestoneId);
    if (!targetMilestone) {
      return error(`Milestone ${options.milestoneId} not found.`, "NOT_FOUND");
    }
  }

  const sections: OutputSection[] = [
    section.header(targetMilestone ? `Epic Planning: ${options.milestoneId}` : "Epic Planning"),
  ];

  // List existing epics
  const epicDirs = await state.listEpicDirs();
  const milestoneHasEpics = targetMilestone
    ? targetMilestone.epics.length > 0
    : epicDirs.length > 0;

  if (!milestoneHasEpics && targetMilestone) {
    sections.push(section.info(`No epics for ${options.milestoneId} yet.`));
    sections.push(section.blank());
    sections.push(section.subheader(`Milestone: ${targetMilestone.name}`));
    sections.push(section.dim(`  ${targetMilestone.description}`));

    const aiGuidance = getEpicsGuidance(targetMilestone, []);

    return success(
      {
        milestoneId: options.milestoneId,
        milestone: targetMilestone,
        epics: [],
        hasEpics: false,
      },
      sections,
      aiGuidance
    );
  }

  if (!milestoneHasEpics && !targetMilestone) {
    sections.push(section.info("No epics generated yet."));
    sections.push(section.blank());
    sections.push(section.info("Pick a milestone to work on (M1 recommended):"));
    for (const m of index.milestones) {
      sections.push(section.dim(`   ${m.id}: ${m.name}`));
    }

    return success(
      { epics: [], hasEpics: false },
      sections
    );
  }

  // Show epics
  const milestonesToShow = targetMilestone ? [targetMilestone] : index.milestones;
  const allEpics: EpicsData["epics"] = [];

  sections.push(section.subheader(targetMilestone ? `Epics for ${targetMilestone.id}` : "Epics by Milestone"));
  sections.push(section.blank());

  for (const m of milestonesToShow) {
    sections.push(section.text(`  ${m.id}: ${m.name}`));

    const epicIds = m.epics || [];
    if (epicIds.length === 0) {
      sections.push(section.dim("     (no epics yet)"));
    } else {
      for (const epicDir of epicDirs) {
        const [epicId] = epicDir.split("-");
        if (epicIds.includes(epicId)) {
          const slug = epicDir.split("-").slice(1).join("-");
          const epicWithStatus = await state.getEpicWithStatus(epicId, slug);
          if (epicWithStatus) {
            const { epic, status } = epicWithStatus;
            allEpics.push({ epic, status });
            const icon = statusIcon(status);
            sections.push({
              type: "status",
              content: {
                icon,
                text: `     ${epic.id}: ${epic.name} [${status}]`,
                status,
                category: statusCategory(status),
              },
            });
          }
        }
      }
    }
    sections.push(section.blank());
  }

  // Next step guidance for specific milestone
  if (targetMilestone) {
    const incompleteEpics = allEpics.filter((e) => e.status !== "done");
    if (incompleteEpics.length > 0) {
      const nextEpic = incompleteEpics[0];
      sections.push(section.info(`NEXT: Continue with ${nextEpic.epic.id} (${nextEpic.status})`));
    } else {
      sections.push(section.success(`All epics in ${targetMilestone.id} complete!`));
    }
  }

  const aiGuidance = targetMilestone
    ? getEpicsGuidance(targetMilestone, allEpics)
    : undefined;

  return success(
    {
      milestoneId: options.milestoneId,
      milestone: targetMilestone,
      epics: allEpics,
      hasEpics: true,
    },
    sections,
    aiGuidance
  );
}

export async function addEpic(
  state: StateManager,
  options: { milestoneId: string; name: string; description: string }
): Promise<CommandResult<{ epic: Epic }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const index = await state.readMilestoneIndex();
  if (!index) {
    return error("No milestones found.", "NO_MILESTONES");
  }

  const milestone = index.milestones.find((m) => m.id === options.milestoneId);
  if (!milestone) {
    return error(`Milestone ${options.milestoneId} not found.`, "NOT_FOUND");
  }

  // Calculate epic number
  const existingEpics = await state.listEpicDirs();
  const epicNum = existingEpics.length + 1;
  const epicId = `E${epicNum}`;
  const slug = slugify(options.name);

  // Create epic directory
  await state.createEpicDir(epicId, slug);

  // Create epic metadata
  const epic: Epic = {
    id: epicId,
    slug,
    name: options.name,
    description: options.description,
    milestone: options.milestoneId,
    deferred: false,
    created: now(),
    updated: now(),
    artifacts: {
      prd: { status: "pending", version: 1 },
      architecture: { status: "pending", version: 1 },
      stories: { status: "pending", count: 0 },
    },
    dependencies: [],
    stats: {
      requirements: 0,
      stories: 0,
      coverage: 0,
    },
  };

  await state.writeEpic(epic);

  // Update milestone
  milestone.epics.push(epicId);
  milestone.updated = now();
  await state.writeMilestoneIndex(index);

  // Update project stats
  const project = await state.readProject();
  if (project) {
    project.stats.epics = existingEpics.length + 1;
    await state.writeProject(project);
  }

  const sections: OutputSection[] = [
    section.success(`Created epic ${epicId}: ${options.name}`),
    section.blank(),
    section.info("Next: Run discovery for this epic or proceed to PRD"),
  ];

  const aiGuidance: AIGuidance = {
    situation: `Epic ${epicId} created, ready for discovery or PRD`,
    instructions: [
      "Ask user if they want to run discovery for this epic",
      "Discovery helps gather scope, constraints, and success criteria",
      "If they skip, proceed directly to PRD generation",
    ],
    commands: [
      {
        command: "discover element",
        args: `{ elementType: 'epic', elementId: '${epicId}' }`,
        description: "Run epic discovery",
        when: "To gather more context before PRD",
      },
      {
        command: "plan epic",
        args: epicId,
        description: "Plan epic (PRD generation)",
        when: "To skip discovery and proceed to PRD",
      },
    ],
  };

  return success({ epic }, sections, aiGuidance);
}

export async function planEpic(
  state: StateManager,
  options: { epicId: string }
): Promise<CommandResult<EpicPlanningData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const ctx = await state.assembleEpicContext(options.epicId);

  // Find epic directory
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));
  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const storiesFile = await state.readStories(options.epicId, slug);
  const derivedStatus = await state.deriveEpicStatus(ctx.epic, storiesFile?.stories || null);

  // Determine next step
  let nextStep: EpicPlanningData["nextStep"] = "complete";
  if (ctx.epic.artifacts.prd.status === "pending") {
    nextStep = "prd";
  } else if (ctx.epic.artifacts.architecture.status === "pending") {
    nextStep = "architecture";
  } else if (ctx.epic.artifacts.stories.status === "pending") {
    nextStep = "stories";
  }

  const data: EpicPlanningData = {
    epic: ctx.epic,
    status: derivedStatus,
    milestone: ctx.milestone,
    artifacts: {
      prd: {
        status: ctx.epic.artifacts.prd.status,
        exists: ctx.epic.artifacts.prd.status === "complete",
      },
      architecture: {
        status: ctx.epic.artifacts.architecture.status,
        exists: ctx.epic.artifacts.architecture.status === "complete",
      },
      stories: {
        status: ctx.epic.artifacts.stories.status,
        count: ctx.epic.artifacts.stories.count,
      },
    },
    nextStep,
  };

  const sections: OutputSection[] = [
    section.header(`Planning ${options.epicId}: ${ctx.epic.name}`),
    section.subheader("Current State"),
    section.dim(`  Description: ${ctx.epic.description}`),
    section.dim(`  Milestone: ${ctx.milestone.id} - ${ctx.milestone.name}`),
    section.dim(`  Status: ${derivedStatus}${ctx.epic.deferred ? " (deferred)" : ""}`),
    section.blank(),
    section.subheader("Artifacts"),
  ];

  const prdIcon = statusIcon(ctx.epic.artifacts.prd.status);
  const archIcon = statusIcon(ctx.epic.artifacts.architecture.status);
  const storiesIcon = statusIcon(ctx.epic.artifacts.stories.status);

  sections.push(section.text(`  ${prdIcon} PRD: ${ctx.epic.artifacts.prd.status}`));
  sections.push(section.text(`  ${archIcon} Architecture: ${ctx.epic.artifacts.architecture.status}`));
  sections.push(section.text(`  ${storiesIcon} Stories: ${ctx.epic.artifacts.stories.status} (${ctx.epic.artifacts.stories.count})`));
  sections.push(section.blank());

  // Show epic discovery if exists
  if (ctx.epicDiscovery) {
    sections.push(section.subheader("Epic Discovery"));
    const discoveryIcon = ctx.epicDiscovery.status === "complete" ? "✓" : ctx.epicDiscovery.status === "in_progress" ? "▶" : "○";
    sections.push(section.text(`  ${discoveryIcon} Status: ${ctx.epicDiscovery.status}`));
    if (ctx.epicDiscovery.problem) {
      sections.push(section.dim(`  Problem: ${ctx.epicDiscovery.problem.slice(0, 60)}...`));
    }
    sections.push(section.blank());
  }

  // Next step
  if (nextStep === "prd") {
    sections.push(section.info("NEXT: Generate PRD"));
  } else if (nextStep === "architecture") {
    sections.push(section.info("NEXT: Generate Architecture"));
  } else if (nextStep === "stories") {
    sections.push(section.info("NEXT: Generate Stories"));
  } else {
    sections.push(section.success("All artifacts generated!"));
  }

  const aiGuidance = getEpicPlanningGuidance(ctx, nextStep);

  return success(data, sections, aiGuidance);
}

// ============================================================================
// PRD Commands
// ============================================================================

export async function savePrd(
  state: StateManager,
  options: { epicId: string; content: string }
): Promise<CommandResult<{ saved: boolean }>> {
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");

  // Write PRD
  await state.writePrd(options.epicId, slug, options.content);

  // Update epic metadata
  const epic = await state.readEpic(options.epicId, slug);
  if (epic) {
    epic.artifacts.prd.status = "complete";
    epic.artifacts.prd.version = (epic.artifacts.prd.version || 0) + 1;
    epic.artifacts.prd.last_updated = now();

    // Count requirements
    const reqMatches = options.content.match(/### R\d+:/g);
    epic.stats.requirements = reqMatches?.length || 0;

    await state.writeEpic(epic);
  }

  const sections: OutputSection[] = [
    section.success(`PRD saved for ${options.epicId}`),
    section.info(`Next: Generate architecture`),
  ];

  return success({ saved: true }, sections);
}

// ============================================================================
// Architecture Commands
// ============================================================================

export async function saveArchitecture(
  state: StateManager,
  options: { epicId: string; content: string }
): Promise<CommandResult<{ saved: boolean }>> {
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");

  // Write architecture
  await state.writeArchitecture(options.epicId, slug, options.content);

  // Update epic metadata
  const epic = await state.readEpic(options.epicId, slug);
  if (epic) {
    epic.artifacts.architecture.status = "complete";
    epic.artifacts.architecture.version = (epic.artifacts.architecture.version || 0) + 1;
    epic.artifacts.architecture.last_updated = now();
    await state.writeEpic(epic);
  }

  const sections: OutputSection[] = [
    section.success(`Architecture saved for ${options.epicId}`),
    section.info(`Next: Generate stories`),
  ];

  return success({ saved: true }, sections);
}

// ============================================================================
// Stories Commands
// ============================================================================

export async function showStories(
  state: StateManager,
  options: { epicId: string }
): Promise<CommandResult<StoriesData>> {
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const existingStories = await state.readStories(options.epicId, slug);

  if (existingStories && existingStories.stories.length > 0) {
    const sections: OutputSection[] = [
      section.header(`Stories: ${options.epicId}`),
      section.warning(`${existingStories.stories.length} stories already exist.`),
      section.blank(),
    ];

    for (const story of existingStories.stories) {
      const icon = statusIcon(story.status);
      sections.push({
        type: "status",
        content: {
          icon,
          text: `${story.id}: ${story.title}`,
          status: story.status,
          category: statusCategory(story.status),
        },
      });
    }

    return success(
      {
        epicId: options.epicId,
        epicName: options.epicId,
        stories: existingStories.stories,
        requirements: [],
      },
      sections
    );
  }

  // No stories yet - show generation guidance
  const ctx = await state.assembleStoryContext(options.epicId);

  const sections: OutputSection[] = [
    section.header(`Story Generation: ${ctx.epic.name}`),
    section.subheader("PRD Requirements to Cover"),
  ];

  if (ctx.requirements.length > 0) {
    for (const req of ctx.requirements) {
      sections.push(section.dim(`  ${req.id}: ${req.title}`));
    }
  }

  sections.push(section.blank());

  const aiGuidance = getStoriesGuidance(ctx);

  return success(
    {
      epicId: options.epicId,
      epicName: ctx.epic.name,
      stories: [],
      requirements: ctx.requirements,
    },
    sections,
    aiGuidance
  );
}

export async function addStory(
  state: StateManager,
  options: {
    epicId: string;
    title: string;
    description: string;
    requirements: string[];
    criteria: string[];
  }
): Promise<CommandResult<{ story: Story }>> {
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");

  // Read or create stories file
  let storiesFile = await state.readStories(options.epicId, slug);
  if (!storiesFile) {
    storiesFile = {
      epic_id: options.epicId,
      stories: [],
      coverage: {},
      validation: {
        coverage_complete: false,
        all_links_valid: false,
      },
    };
  }

  // Create story
  const storyNum = storiesFile.stories.length + 1;
  const story: Story = {
    id: `${options.epicId}.S${storyNum}`,
    title: options.title,
    description: options.description,
    type: "feature",
    requirements: options.requirements.map((r) => `${options.epicId}.${r}`),
    acceptance_criteria: options.criteria,
    dependencies: [],
    status: "todo",
    assignee: null,
  };

  storiesFile.stories.push(story);

  // Update coverage map
  for (const req of options.requirements) {
    const fullReq = `${options.epicId}.${req}`;
    if (!storiesFile.coverage[fullReq]) {
      storiesFile.coverage[fullReq] = [];
    }
    storiesFile.coverage[fullReq].push(story.id);
  }

  await state.writeStories(options.epicId, slug, storiesFile);

  // Update epic
  const epic = await state.readEpic(options.epicId, slug);
  if (epic) {
    epic.artifacts.stories.count = storiesFile.stories.length;
    epic.stats.stories = storiesFile.stories.length;
    await state.writeEpic(epic);
  }

  // Update project stats
  const project = await state.readProject();
  if (project) {
    let totalStories = 0;
    for (const dir of await state.listEpicDirs()) {
      const [id] = dir.split("-");
      const s = dir.split("-").slice(1).join("-");
      const sf = await state.readStories(id, s);
      if (sf) totalStories += sf.stories.length;
    }
    project.stats.stories = totalStories;
    await state.writeProject(project);
  }

  const sections: OutputSection[] = [
    section.success(`Added story ${story.id}: ${options.title}`),
  ];

  return success({ story }, sections);
}

export async function saveStories(
  state: StateManager,
  options: { epicId: string; stories: Story[] }
): Promise<CommandResult<{ count: number }>> {
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");

  // Build stories file
  const storiesFile: StoriesFile = {
    epic_id: options.epicId,
    stories: options.stories.map((s, i) => ({
      ...s,
      id: s.id || `${options.epicId}.S${i + 1}`,
      status: s.status || "todo",
      assignee: s.assignee || null,
    })),
    coverage: {},
    validation: {
      coverage_complete: false,
      all_links_valid: false,
    },
  };

  // Build coverage map
  for (const story of storiesFile.stories) {
    for (const req of story.requirements) {
      if (!storiesFile.coverage[req]) {
        storiesFile.coverage[req] = [];
      }
      storiesFile.coverage[req].push(story.id);
    }
  }

  await state.writeStories(options.epicId, slug, storiesFile);

  // Update epic
  const epic = await state.readEpic(options.epicId, slug);
  if (epic) {
    epic.artifacts.stories.status = "complete";
    epic.artifacts.stories.count = storiesFile.stories.length;
    epic.stats.stories = storiesFile.stories.length;
    await state.writeEpic(epic);
  }

  const sections: OutputSection[] = [
    section.success(`Saved ${storiesFile.stories.length} stories for ${options.epicId}`),
  ];

  return success({ count: storiesFile.stories.length }, sections);
}

export async function markStoriesComplete(
  state: StateManager,
  options: { epicId: string }
): Promise<CommandResult<{ completed: boolean }>> {
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const epic = await state.readEpic(options.epicId, slug);

  if (epic) {
    epic.artifacts.stories.status = "complete";
    await state.writeEpic(epic);
  }

  const sections: OutputSection[] = [
    section.success(`${options.epicId} stories marked complete`),
    section.info("Run validation: validate epic " + options.epicId),
  ];

  return success({ completed: true }, sections);
}

