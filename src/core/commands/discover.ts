/**
 * Discovery Commands for Lisa Engine
 *
 * Handles project initialization and discovery conversation flow.
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
  now,
  validateMilestoneId,
} from "../utils.js";
import {
  DiscoveryContext,
  DiscoveryHistory,
  DiscoveryHistoryEntry,
  Constraints,
  Constraint,
  Value,
  ElementDiscovery,
  DiscoveryDepth,
  Epic,
  Milestone,
} from "../schemas.js";
import {
  getDiscoveryGuidance,
  getElementDiscoveryGuidance,
  getAddEntryGuidance,
} from "../prompts/discovery.js";

// ============================================================================
// Types
// ============================================================================

export interface DiscoveryStatusData {
  context: DiscoveryContext | null;
  constraints: Constraints | null;
  history: DiscoveryHistory | null;
  progress: {
    answeredRequired: number;
    totalRequired: number;
    percent: number;
  };
}

export interface DiscoveryStartData {
  depth: DiscoveryDepth;
  context: DiscoveryContext | null;
  constraints: Constraints | null;
  history: DiscoveryHistory | null;
  gaps: string[];
}

// ============================================================================
// Discovery Guidance Data
// ============================================================================

interface DiscoveryGuidanceData {
  category: DiscoveryHistoryEntry["category"];
  purpose: string;
  starterQuestions: string[];
  depthHints: {
    quick: string;
    standard: string;
    deep: string;
  };
  includedIn: DiscoveryDepth[];
}

const DISCOVERY_GUIDANCE_DATA: DiscoveryGuidanceData[] = [
  {
    category: "problem",
    purpose: "Understand what we're solving and for whom",
    starterQuestions: [
      "What problem are we solving?",
      "Who experiences this problem most acutely?",
      "What happens if we don't solve this?",
    ],
    depthHints: {
      quick: "Get a clear one-sentence problem statement",
      standard: "Understand the problem, who it affects, and current workarounds",
      deep: "Map the problem landscape, quantify impact, explore root causes",
    },
    includedIn: ["quick", "standard", "deep"],
  },
  {
    category: "vision",
    purpose: "Define what success looks like",
    starterQuestions: [
      "What does the ideal end state look like?",
      "How will users' lives be different?",
    ],
    depthHints: {
      quick: "Get a clear vision statement",
      standard: "Understand the desired outcome and key benefits",
      deep: "Explore alternative visions, trade-offs, and long-term implications",
    },
    includedIn: ["quick", "standard", "deep"],
  },
  {
    category: "users",
    purpose: "Understand who we're building for",
    starterQuestions: [
      "Who are the primary users?",
      "What are their key pain points today?",
      "How do they currently solve this problem?",
    ],
    depthHints: {
      quick: "Identify the primary user group",
      standard: "Understand 2-3 user types and their needs",
      deep: "Build detailed personas, map user journeys, identify edge cases",
    },
    includedIn: ["standard", "deep"],
  },
  {
    category: "values",
    purpose: "Prioritize what matters most",
    starterQuestions: [
      "What's the most important quality this solution must have?",
      "What would you sacrifice to get that quality?",
      "What's the second most important quality?",
    ],
    depthHints: {
      quick: "Identify the #1 priority",
      standard: "Understand top 2-3 priorities and their trade-offs",
      deep: "Build a complete value hierarchy with explicit trade-off decisions",
    },
    includedIn: ["standard", "deep"],
  },
  {
    category: "constraints",
    purpose: "Identify tech stack, team capabilities, and hard limits",
    starterQuestions: [
      "What's your current tech stack? What technologies are you comfortable with?",
      "What skills does your team have? Any gaps?",
      "What's your team size and availability?",
      "Are there timeline or budget constraints?",
      "Is there anything we absolutely cannot change?",
    ],
    depthHints: {
      quick: "Note tech stack and team size",
      standard: "Document tech stack, team skills, resources, and constraints",
      deep: "Full capability assessment: tech, team, timeline, budget, dependencies",
    },
    includedIn: ["quick", "standard", "deep"],
  },
  {
    category: "success",
    purpose: "Define measurable outcomes",
    starterQuestions: [
      "How will we know if this is successful?",
      "What metrics matter most?",
      "What's the minimum viable success?",
    ],
    depthHints: {
      quick: "Get one clear success metric",
      standard: "Define 2-3 success criteria with targets",
      deep: "Build a measurement framework with leading/lagging indicators",
    },
    includedIn: ["quick", "standard", "deep"],
  },
  {
    category: "other",
    purpose: "Research existing solutions and benchmarks",
    starterQuestions: [
      "What existing solutions have you looked at?",
      "What do competitors do well? What do they do poorly?",
      "Are there industry standards or benchmarks we should meet?",
    ],
    depthHints: {
      quick: "Note any obvious references",
      standard: "Review 2-3 alternatives and key differentiators",
      deep: "Comprehensive competitive analysis with feature matrix",
    },
    includedIn: ["standard", "deep"],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function checkCategoryHasContent(
  category: DiscoveryHistoryEntry["category"],
  context: DiscoveryContext | null,
  constraints: Constraints | null,
  history: DiscoveryHistory | null
): boolean {
  // Check if history has entries for this category
  const hasHistoryEntry = history?.entries.some((e) => e.category === category) || false;

  switch (category) {
    case "problem":
      return !!context?.problem || hasHistoryEntry;
    case "vision":
      return !!context?.vision || hasHistoryEntry;
    case "users":
      return (context?.users && context.users.length > 0) || hasHistoryEntry;
    case "values":
      return (context?.values && context.values.length > 0) || hasHistoryEntry;
    case "constraints":
      return (constraints?.constraints && constraints.constraints.length > 0) || hasHistoryEntry;
    case "success":
      return (context?.success_criteria && context.success_criteria.length > 0) || hasHistoryEntry;
    case "other":
      return hasHistoryEntry;
    default:
      return false;
  }
}

function findDiscoveryGaps(
  context: DiscoveryContext | null,
  constraints: Constraints | null,
  history: DiscoveryHistory | null,
  depth: DiscoveryDepth
): string[] {
  const gaps: string[] = [];
  const guidanceForDepth = DISCOVERY_GUIDANCE_DATA.filter((g) => g.includedIn.includes(depth));

  for (const guidance of guidanceForDepth) {
    if (!checkCategoryHasContent(guidance.category, context, constraints, history)) {
      gaps.push(guidance.category);
    }
  }

  return gaps;
}

function createEmptyElementDiscovery(
  elementType: "milestone" | "epic" | "story",
  elementId: string,
  source: "ai_proposed" | "user_added" | "feedback"
): ElementDiscovery {
  const timestamp = now();
  return {
    element_type: elementType,
    element_id: elementId,
    problem: undefined,
    scope: [],
    out_of_scope: [],
    success_criteria: [],
    constraints: [],
    history: [],
    status: "not_started",
    source,
    created: timestamp,
    updated: timestamp,
  };
}

async function updateContextFromEntry(
  state: StateManager,
  entry: DiscoveryHistoryEntry
): Promise<void> {
  const context = (await state.readDiscoveryContext()) || {
    users: [],
    values: [],
    success_criteria: [],
  };

  const constraints = (await state.readConstraints()) || { constraints: [] };

  switch (entry.category) {
    case "problem":
      context.problem = entry.answer;
      context.gathered = now();
      await state.writeDiscoveryContext(context);
      break;

    case "vision":
      context.vision = entry.answer;
      context.gathered = now();
      await state.writeDiscoveryContext(context);
      break;

    case "users":
      if (!context.users) context.users = [];
      context.users.push(entry.answer);
      context.gathered = now();
      await state.writeDiscoveryContext(context);
      break;

    case "values":
      const valueId = `V${context.values.length + 1}`;
      const value: Value = {
        id: valueId,
        name: entry.answer.split(/[.!?]/)[0].slice(0, 50),
        description: entry.answer,
        priority: context.values.length + 1,
      };
      context.values.push(value);
      context.gathered = now();
      await state.writeDiscoveryContext(context);
      break;

    case "success":
      context.success_criteria.push(entry.answer);
      context.gathered = now();
      await state.writeDiscoveryContext(context);
      break;

    case "constraints":
      let constraintType: Constraint["type"] = "business";
      if (entry.question.toLowerCase().includes("technical")) {
        constraintType = "technical";
      } else if (entry.question.toLowerCase().includes("resource")) {
        constraintType = "resource";
      } else if (
        entry.question.toLowerCase().includes("cannot change") ||
        entry.question.toLowerCase().includes("frozen")
      ) {
        constraintType = "frozen";
      }

      const constraint: Constraint = {
        id: `C${constraints.constraints.length + 1}`,
        type: constraintType,
        constraint: entry.answer,
        impact: [],
      };
      constraints.constraints.push(constraint);
      constraints.gathered = now();
      await state.writeConstraints(constraints);
      break;
  }
}

// ============================================================================
// Init Command
// ============================================================================

export async function init(
  state: StateManager,
  options: { name: string }
): Promise<CommandResult<{ project: { id: string; name: string } }>> {
  if (await state.isInitialized()) {
    return error(
      "Project already initialized. Use 'discover' to continue.",
      "ALREADY_INITIALIZED"
    );
  }

  const projectName = options.name || "Untitled Project";
  const project = await state.initialize(projectName);

  const sections: OutputSection[] = [
    section.success(`Lisa initialized: ${project.name}`),
  ];

  // Jump straight to discovery guidance with fresh state
  const defaultGaps = ["problem", "vision", "users", "values", "constraints", "success"];
  const aiGuidance = getDiscoveryGuidance(null, null, null, "standard", defaultGaps, true);

  return success({ project: { id: project.id, name: project.name } }, sections, aiGuidance);
}

// ============================================================================
// Status Command
// ============================================================================

export async function status(state: StateManager): Promise<CommandResult<DiscoveryStatusData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found. Run 'discover init' first.", "NOT_INITIALIZED");
  }

  const context = await state.readDiscoveryContext();
  const constraints = await state.readConstraints();
  const history = await state.readDiscoveryHistory();

  // Calculate completion using category-based approach (standard depth categories)
  const coreCategories: DiscoveryHistoryEntry["category"][] = [
    "problem",
    "vision",
    "users",
    "values",
    "constraints",
    "success",
  ];
  const completedCategories = coreCategories.filter((cat) =>
    checkCategoryHasContent(cat, context, constraints, history)
  );

  const progress = {
    answeredRequired: completedCategories.length,
    totalRequired: coreCategories.length,
    percent: Math.round((completedCategories.length / coreCategories.length) * 100),
  };

  const data: DiscoveryStatusData = {
    context,
    constraints,
    history,
    progress,
  };

  const sections: OutputSection[] = [
    section.header("Discovery Status"),
    section.subheader("Progress"),
    section.progress(progress.answeredRequired, progress.totalRequired, "Core categories"),
    section.blank(),
    section.subheader("Context Gathered"),
  ];

  if (checkCategoryHasContent("problem", context, constraints, history)) {
    sections.push(section.success(`Problem: ${context?.problem?.slice(0, 60) || "(in history)"}${context?.problem && context.problem.length > 60 ? "..." : ""}`));
  } else {
    sections.push(section.dim("  Problem: Not yet defined"));
  }

  if (checkCategoryHasContent("vision", context, constraints, history)) {
    sections.push(section.success(`Vision: ${context?.vision?.slice(0, 60) || "(in history)"}${context?.vision && context.vision.length > 60 ? "..." : ""}`));
  } else {
    sections.push(section.dim("  Vision: Not yet defined"));
  }

  if (checkCategoryHasContent("users", context, constraints, history)) {
    sections.push(section.success(`Users: ${context?.users?.length || 0} defined`));
  } else {
    sections.push(section.dim("  Users: None defined"));
  }

  if (checkCategoryHasContent("values", context, constraints, history)) {
    sections.push(section.success(`Values: ${context?.values?.length || 0} defined`));
  } else {
    sections.push(section.dim("  Values: None defined"));
  }

  if (checkCategoryHasContent("success", context, constraints, history)) {
    sections.push(section.success(`Success Criteria: ${context?.success_criteria?.length || 0} defined`));
  } else {
    sections.push(section.dim("  Success Criteria: None defined"));
  }

  sections.push(section.blank());
  sections.push(section.subheader("Constraints"));

  if (checkCategoryHasContent("constraints", context, constraints, history)) {
    for (const c of constraints?.constraints || []) {
      sections.push(section.text(`  [${c.type}] ${c.constraint}`));
    }
  } else {
    sections.push(section.dim("  No constraints defined"));
  }

  sections.push(section.blank());

  // Show readiness based on whether we have sufficient context
  const hasContext = checkCategoryHasContent("problem", context, constraints, history) ||
    checkCategoryHasContent("vision", context, constraints, history);
  if (hasContext && progress.percent >= 50) {
    sections.push(section.success("Ready for planning - or continue adding context"));
  } else {
    sections.push(section.info("Continue discovery to gather more context"));
  }

  return success(data, sections);
}

// ============================================================================
// History Command - show all discovery Q&A entries
// ============================================================================

export interface DiscoveryHistoryData {
  entries: DiscoveryHistoryEntry[];
  count: number;
}

export async function history(
  state: StateManager
): Promise<CommandResult<DiscoveryHistoryData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const historyData = await state.readDiscoveryHistory();
  const entries = historyData?.entries || [];

  const sections: OutputSection[] = [
    section.header("Discovery History"),
    section.info(`${entries.length} entries recorded`),
    section.blank(),
  ];

  if (entries.length === 0) {
    sections.push(section.dim("No discovery entries yet. Run 'lisa discover' to start."));
  } else {
    for (const entry of entries) {
      const date = new Date(entry.timestamp).toLocaleDateString();
      sections.push(section.subheader(`[${entry.category}] ${date}`));
      sections.push(section.dim(`  Q: ${entry.question}`));
      sections.push(section.text(`  A: ${entry.answer}`));
      sections.push(section.blank());
    }
  }

  return success({ entries, count: entries.length }, sections);
}

// ============================================================================
// Start Command (main discovery flow)
// ============================================================================

export async function start(
  state: StateManager,
  options: { depth?: DiscoveryDepth } = {}
): Promise<CommandResult<DiscoveryStartData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found. Run 'discover init' first.", "NOT_INITIALIZED");
  }

  const history = await state.readDiscoveryHistory();
  const context = await state.readDiscoveryContext();
  const constraints = await state.readConstraints();

  // Determine depth
  const depth: DiscoveryDepth = options.depth || history?.depth_preference || "standard";

  // Update stored preference if changed
  if (options.depth && history && history.depth_preference !== options.depth) {
    history.depth_preference = options.depth;
    history.last_active = now();
    await state.writeDiscoveryHistory(history);
  }

  const gaps = findDiscoveryGaps(context, constraints, history, depth);

  const data: DiscoveryStartData = {
    depth,
    context,
    constraints,
    history,
    gaps,
  };

  // Build sections
  const depthLabels = {
    quick: "Quick (essentials)",
    standard: "Standard",
    deep: "Deep (comprehensive)",
  };

  const sections: OutputSection[] = [
    section.header("Discovery Conversation"),
    section.blank(),
    section.info(`Depth: ${depthLabels[depth]}`),
    section.dim("  Change with: --quick, --standard, or --deep"),
    section.blank(),
    section.subheader("What We Know So Far"),
  ];

  const hasContext =
    context?.problem ||
    context?.vision ||
    (context?.values && context.values.length > 0) ||
    (context?.success_criteria && context.success_criteria.length > 0) ||
    (constraints?.constraints && constraints.constraints.length > 0);

  if (!hasContext) {
    sections.push(section.dim("  (Nothing gathered yet - let's start exploring!)"));
  } else {
    if (context?.problem) {
      sections.push(
        section.success(
          `  Problem: ${context.problem.slice(0, 70)}${context.problem.length > 70 ? "..." : ""}`
        )
      );
    }
    if (context?.vision) {
      sections.push(
        section.success(
          `  Vision: ${context.vision.slice(0, 70)}${context.vision.length > 70 ? "..." : ""}`
        )
      );
    }
    if (context?.values && context.values.length > 0) {
      sections.push(section.success(`  Values: ${context.values.length} defined`));
    }
    if (context?.success_criteria && context.success_criteria.length > 0) {
      sections.push(section.success(`  Success criteria: ${context.success_criteria.length} defined`));
    }
    if (constraints?.constraints && constraints.constraints.length > 0) {
      sections.push(section.success(`  Constraints: ${constraints.constraints.length} defined`));
    }
  }

  sections.push(section.blank());
  sections.push(section.subheader("Suggested Areas to Explore"));
  sections.push(section.blank());

  const guidanceForDepth = DISCOVERY_GUIDANCE_DATA.filter((g) => g.includedIn.includes(depth));

  for (const guidance of guidanceForDepth) {
    const hasContent = checkCategoryHasContent(guidance.category, context, constraints, history);
    const icon = hasContent ? "✓" : "○";
    const statusText = hasContent ? "(has content)" : "(explore this)";

    sections.push(section.text(`  ${icon} [${guidance.category}] ${guidance.purpose} ${statusText}`));
    sections.push(section.dim(`     Goal: ${guidance.depthHints[depth]}`));
    if (!hasContent) {
      sections.push(section.dim(`     Start with: "${guidance.starterQuestions[0]}"`));
    }
  }

  sections.push(section.blank());
  sections.push(section.divider());
  sections.push(section.blank());

  // Get AI guidance from prompts module
  const aiGuidance = getDiscoveryGuidance(context, history, constraints, depth, gaps);

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Add Entry Command
// ============================================================================

export async function addEntry(
  state: StateManager,
  options: {
    category: DiscoveryHistoryEntry["category"];
    question: string;
    answer: string;
  }
): Promise<CommandResult<{ entry: DiscoveryHistoryEntry }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  // Read existing history
  let history = await state.readDiscoveryHistory();
  if (!history) {
    history = { entries: [] };
  }

  // Add new entry
  const entry: DiscoveryHistoryEntry = {
    timestamp: now(),
    question: options.question,
    answer: options.answer,
    category: options.category,
  };

  history.entries.push(entry);
  if (!history.started) {
    history.started = now();
  }
  history.last_active = now();

  await state.writeDiscoveryHistory(history);

  // Update context based on category
  await updateContextFromEntry(state, entry);

  const sections: OutputSection[] = [
    section.success(`Added ${options.category} entry`),
  ];

  return success({ entry }, sections, getAddEntryGuidance());
}


// ============================================================================
// Element Discovery Commands (Epic/Milestone)
// ============================================================================

async function findEpicByIdOrSlug(
  state: StateManager,
  epicIdOrSlug: string
): Promise<{ id: string; slug: string; epic: Epic } | null> {
  const epicDirs = await state.listEpicDirs();

  for (const dir of epicDirs) {
    const match = dir.match(/^(E\d+)-(.+)$/);
    if (!match) continue;

    const [, epicId, slug] = match;

    if (epicId === epicIdOrSlug || dir === epicIdOrSlug || dir.startsWith(epicIdOrSlug + "-")) {
      const epic = await state.readEpic(epicId, slug);
      if (epic) {
        return { id: epicId, slug, epic };
      }
    }
  }

  return null;
}

async function findMilestoneById(state: StateManager, milestoneId: string): Promise<Milestone | null> {
  const index = await state.readMilestoneIndex();
  if (!index) return null;
  return index.milestones.find((m) => m.id === milestoneId) || null;
}

export async function element(
  state: StateManager,
  options: { elementType: "milestone" | "epic"; elementId: string }
): Promise<CommandResult<{ discovery: ElementDiscovery | null; element: Epic | Milestone | null }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const { elementType, elementId } = options;

  if (elementType === "epic") {
    const epicInfo = await findEpicByIdOrSlug(state, elementId);
    if (!epicInfo) {
      return error(`Epic not found: ${elementId}`, "EPIC_NOT_FOUND");
    }

    let discovery = await state.readEpicDiscovery(epicInfo.id, epicInfo.slug);
    if (!discovery) {
      discovery = createEmptyElementDiscovery("epic", epicInfo.id, "user_added");
    }

    if (discovery.status !== "complete") {
      discovery.status = "in_progress";
      await state.writeEpicDiscovery(epicInfo.id, epicInfo.slug, discovery);
    }

    const sections: OutputSection[] = [
      section.header(`Epic Discovery: ${epicInfo.epic.name}`),
      section.info(`Epic: ${epicInfo.id} - ${epicInfo.epic.name}`),
      section.dim(`Description: ${epicInfo.epic.description}`),
      section.blank(),
    ];

    if (discovery.status === "complete") {
      sections.push(section.success("Discovery for this epic is complete"));
    }

    const aiGuidance = getElementDiscoveryGuidance("epic", epicInfo.epic.name, discovery);

    return success({ discovery, element: epicInfo.epic }, sections, aiGuidance);
  } else {
    if (!validateMilestoneId(elementId)) {
      return error(`Invalid milestone ID: ${elementId}. Expected format: M1, M2, etc.`, "INVALID_ID");
    }

    const milestone = await findMilestoneById(state, elementId);
    if (!milestone) {
      return error(`Milestone not found: ${elementId}`, "MILESTONE_NOT_FOUND");
    }

    let discovery = await state.readMilestoneDiscovery(elementId);
    if (!discovery) {
      discovery = createEmptyElementDiscovery("milestone", elementId, "user_added");
    }

    if (discovery.status !== "complete") {
      discovery.status = "in_progress";
      await state.writeMilestoneDiscovery(elementId, discovery);
    }

    const sections: OutputSection[] = [
      section.header(`Milestone Discovery: ${milestone.name}`),
      section.info(`Milestone: ${elementId} - ${milestone.name}`),
      section.dim(`Description: ${milestone.description}`),
      section.blank(),
    ];

    if (discovery.status === "complete") {
      sections.push(section.success("Discovery for this milestone is complete"));
    }

    const aiGuidance = getElementDiscoveryGuidance("milestone", milestone.name, discovery);

    return success({ discovery, element: milestone }, sections, aiGuidance);
  }
}

export async function addElementEntry(
  state: StateManager,
  options: {
    elementType: "milestone" | "epic";
    elementId: string;
    category: DiscoveryHistoryEntry["category"];
    question: string;
    answer: string;
  }
): Promise<CommandResult<{ entry: DiscoveryHistoryEntry }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const entry: DiscoveryHistoryEntry = {
    timestamp: now(),
    question: options.question,
    answer: options.answer,
    category: options.category,
  };

  if (options.elementType === "epic") {
    const epicInfo = await findEpicByIdOrSlug(state, options.elementId);
    if (!epicInfo) {
      return error(`Epic not found: ${options.elementId}`, "EPIC_NOT_FOUND");
    }

    let discovery = await state.readEpicDiscovery(epicInfo.id, epicInfo.slug);
    if (!discovery) {
      discovery = createEmptyElementDiscovery("epic", epicInfo.id, "user_added");
    }

    discovery.history.push(entry);
    updateElementDiscoveryFromEntry(discovery, entry, options.question);
    await state.writeEpicDiscovery(epicInfo.id, epicInfo.slug, discovery);
  } else {
    if (!validateMilestoneId(options.elementId)) {
      return error(`Invalid milestone ID: ${options.elementId}`, "INVALID_ID");
    }

    let discovery = await state.readMilestoneDiscovery(options.elementId);
    if (!discovery) {
      discovery = createEmptyElementDiscovery("milestone", options.elementId, "user_added");
    }

    discovery.history.push(entry);
    updateElementDiscoveryFromEntry(discovery, entry, options.question);
    await state.writeMilestoneDiscovery(options.elementId, discovery);
  }

  const sections: OutputSection[] = [
    section.success(`Added ${options.category} entry to ${options.elementType} ${options.elementId}`),
  ];

  return success({ entry }, sections);
}

function updateElementDiscoveryFromEntry(
  discovery: ElementDiscovery,
  entry: DiscoveryHistoryEntry,
  question: string
): void {
  const lowerQuestion = question.toLowerCase();

  if (entry.category === "problem" || lowerQuestion.includes("problem")) {
    discovery.problem = entry.answer;
  } else if (lowerQuestion.includes("in scope") && !lowerQuestion.includes("out")) {
    discovery.scope.push(entry.answer);
  } else if (lowerQuestion.includes("out of scope")) {
    discovery.out_of_scope.push(entry.answer);
  } else if (
    entry.category === "success" ||
    lowerQuestion.includes("success") ||
    lowerQuestion.includes("done")
  ) {
    discovery.success_criteria.push(entry.answer);
  } else if (
    entry.category === "constraints" ||
    lowerQuestion.includes("constraint") ||
    lowerQuestion.includes("dependencies") ||
    lowerQuestion.includes("blockers")
  ) {
    discovery.constraints.push({
      id: `C${discovery.constraints.length + 1}`,
      type: "technical",
      constraint: entry.answer,
      impact: [],
    });
  }
}

export async function completeElement(
  state: StateManager,
  options: { elementType: "milestone" | "epic"; elementId: string }
): Promise<CommandResult<{ completed: boolean }>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  if (options.elementType === "epic") {
    const epicInfo = await findEpicByIdOrSlug(state, options.elementId);
    if (!epicInfo) {
      return error(`Epic not found: ${options.elementId}`, "EPIC_NOT_FOUND");
    }

    const discovery = await state.readEpicDiscovery(epicInfo.id, epicInfo.slug);
    if (!discovery) {
      return error(`No discovery found for epic ${options.elementId}`, "NO_DISCOVERY");
    }

    discovery.status = "complete";
    await state.writeEpicDiscovery(epicInfo.id, epicInfo.slug, discovery);
  } else {
    if (!validateMilestoneId(options.elementId)) {
      return error(`Invalid milestone ID: ${options.elementId}`, "INVALID_ID");
    }

    const discovery = await state.readMilestoneDiscovery(options.elementId);
    if (!discovery) {
      return error(`No discovery found for milestone ${options.elementId}`, "NO_DISCOVERY");
    }

    discovery.status = "complete";
    await state.writeMilestoneDiscovery(options.elementId, discovery);
  }

  const sections: OutputSection[] = [
    section.success(`Discovery for ${options.elementType} ${options.elementId} marked as complete`),
  ];

  return success({ completed: true }, sections);
}
