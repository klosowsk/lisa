/**
 * State Manager
 *
 * High-level state management facade that delegates persistence
 * to a StateAdapter. Provides domain-specific methods for reading
 * and writing Lisa state, plus business logic for status derivation
 * and context assembly.
 */

import * as path from "path";
import {
  ProjectSchema,
  Project,
  DiscoveryContextSchema,
  DiscoveryContext,
  ConstraintsSchema,
  Constraints,
  DiscoveryHistorySchema,
  DiscoveryHistory,
  ElementDiscoverySchema,
  ElementDiscovery,
  MilestoneIndexSchema,
  MilestoneIndex,
  Milestone,
  EpicSchema,
  Epic,
  StoriesFileSchema,
  StoriesFile,
  Story,
  TaskQueueSchema,
  TaskQueue,
  StuckQueueSchema,
  StuckQueue,
  FeedbackQueueSchema,
  FeedbackQueue,
  ConfigSchema,
  Config,
  CoverageSchema,
  Coverage,
  LinksSchema,
  Links,
  ValidationIssuesSchema,
  ValidationIssues,
  Lock,
  DerivedEpicStatus,
  DerivedMilestoneStatus,
  ProjectContext,
  MilestoneContext,
  EpicContext,
  StoryContext,
} from "./schemas.js";
import { LisaError } from "./utils.js";
import {
  StateAdapter,
  FileSystemStateAdapter,
  LISA_DIR,
} from "../adapters/state/index.js";

// ============================================================================
// Constants - Storage Keys
// ============================================================================

export { LISA_DIR };

export const PATHS = {
  project: "project.json",
  config: "config.yaml",
  taskQueue: "task_queue.json",
  stuckQueue: "stuck_queue.json",
  feedbackQueue: "feedback_queue.json",
  lock: ".lock",
  discovery: {
    dir: "discovery",
    context: "discovery/context.json",
    constraints: "discovery/constraints.json",
    history: "discovery/history.json",
  },
  milestones: {
    dir: "milestones",
    index: "milestones/index.json",
  },
  epics: {
    dir: "epics",
  },
  validation: {
    dir: "validation",
    coverage: "validation/coverage.json",
    links: "validation/links.json",
    issues: "validation/issues.json",
  },
} as const;

// ============================================================================
// State Manager
// ============================================================================

export class StateManager {
  private adapter: StateAdapter;

  constructor(adapter?: StateAdapter) {
    this.adapter = adapter ?? new FileSystemStateAdapter();
  }

  /**
   * Get the underlying adapter (for advanced use cases).
   */
  getAdapter(): StateAdapter {
    return this.adapter;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async isInitialized(): Promise<boolean> {
    return this.adapter.isInitialized();
  }

  async initialize(projectName?: string): Promise<Project> {
    // Create directory structure
    const dirs = [
      PATHS.discovery.dir,
      PATHS.milestones.dir,
      PATHS.epics.dir,
      PATHS.validation.dir,
    ];

    for (const dir of dirs) {
      await this.adapter.ensureDirectory(dir);
    }

    // Create initial project.json
    const now = new Date().toISOString();
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: projectName || "Untitled Project",
      created: now,
      updated: now,
      status: "active",
      stats: {
        milestones: 0,
        epics: 0,
        stories: 0,
        completed_stories: 0,
      },
    };

    await this.writeProject(project);

    // Create empty queues
    await this.writeTaskQueue({ tasks: [], completed: [] });
    await this.writeStuckQueue({ stuck: [], resolved: [] });
    await this.writeFeedbackQueue({ feedback: [], incorporated: [] });

    // Create empty discovery files
    await this.writeDiscoveryContext({
      values: [],
      success_criteria: [],
    });
    await this.writeConstraints({ constraints: [] });
    await this.writeDiscoveryHistory({
      entries: [],
      is_complete: false,
    });

    // Create empty milestones index
    await this.writeMilestoneIndex({ milestones: [] });

    // Create default config
    const defaultConfig: Config = {
      grind: {
        max_attempts: 5,
        same_issue_threshold: 2,
        timeout_minutes: 10,
      },
      checkpoints: [
        "after_epic_breakdown",
        "after_prd_generation",
        "after_architecture",
        "before_export",
      ],
    };
    await this.writeConfig(defaultConfig);

    return project;
  }

  // --------------------------------------------------------------------------
  // Path Helpers
  // --------------------------------------------------------------------------

  getPath(relativePath: string): string {
    return path.join(this.adapter.getRootDir(), LISA_DIR, relativePath);
  }

  getEpicDir(epicId: string, slug: string): string {
    return this.getPath(path.join(PATHS.epics.dir, `${epicId}-${slug}`));
  }

  getEpicPath(epicId: string, slug: string, file: string): string {
    return path.join(this.getEpicDir(epicId, slug), file);
  }

  // --------------------------------------------------------------------------
  // Project
  // --------------------------------------------------------------------------

  async readProject(): Promise<Project | null> {
    return this.adapter.readJson(PATHS.project, ProjectSchema);
  }

  async writeProject(project: Project): Promise<void> {
    project.updated = new Date().toISOString();
    await this.adapter.writeJson(PATHS.project, project);
  }

  async updateProject(updates: Partial<Project>): Promise<Project> {
    const project = await this.readProject();
    if (!project) {
      throw new Error("Project not initialized");
    }
    const updated = { ...project, ...updates };
    await this.writeProject(updated);
    return updated;
  }

  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------

  async readConfig(): Promise<Config | null> {
    return this.adapter.readYaml(PATHS.config, ConfigSchema);
  }

  async writeConfig(config: Config): Promise<void> {
    await this.adapter.writeYaml(PATHS.config, config);
  }

  // --------------------------------------------------------------------------
  // Discovery
  // --------------------------------------------------------------------------

  async readDiscoveryContext(): Promise<DiscoveryContext | null> {
    return this.adapter.readJson(PATHS.discovery.context, DiscoveryContextSchema);
  }

  async writeDiscoveryContext(context: DiscoveryContext): Promise<void> {
    await this.adapter.writeJson(PATHS.discovery.context, context);
  }

  async readConstraints(): Promise<Constraints | null> {
    return this.adapter.readJson(PATHS.discovery.constraints, ConstraintsSchema);
  }

  async writeConstraints(constraints: Constraints): Promise<void> {
    await this.adapter.writeJson(PATHS.discovery.constraints, constraints);
  }

  async readDiscoveryHistory(): Promise<DiscoveryHistory | null> {
    return this.adapter.readJson(PATHS.discovery.history, DiscoveryHistorySchema);
  }

  async writeDiscoveryHistory(history: DiscoveryHistory): Promise<void> {
    await this.adapter.writeJson(PATHS.discovery.history, history);
  }

  // --------------------------------------------------------------------------
  // Milestones
  // --------------------------------------------------------------------------

  async readMilestoneIndex(): Promise<MilestoneIndex | null> {
    return this.adapter.readJson(PATHS.milestones.index, MilestoneIndexSchema);
  }

  async writeMilestoneIndex(index: MilestoneIndex): Promise<void> {
    await this.adapter.writeJson(PATHS.milestones.index, index);
  }

  // --------------------------------------------------------------------------
  // Epics
  // --------------------------------------------------------------------------

  async listEpicDirs(): Promise<string[]> {
    return this.adapter.listDirectories(PATHS.epics.dir);
  }

  async readEpic(epicId: string, slug: string): Promise<Epic | null> {
    const epicPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "epic.json");
    return this.adapter.readJson(epicPath, EpicSchema);
  }

  async writeEpic(epic: Epic): Promise<void> {
    const epicPath = path.join(PATHS.epics.dir, `${epic.id}-${epic.slug}`, "epic.json");
    epic.updated = new Date().toISOString();
    await this.adapter.writeJson(epicPath, epic);
  }

  async readPrd(epicId: string, slug: string): Promise<string | null> {
    const prdPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "prd.md");
    return this.adapter.readText(prdPath);
  }

  async writePrd(epicId: string, slug: string, content: string): Promise<void> {
    const prdPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "prd.md");
    await this.adapter.writeText(prdPath, content);
  }

  async readArchitecture(epicId: string, slug: string): Promise<string | null> {
    const archPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "architecture.md");
    return this.adapter.readText(archPath);
  }

  async writeArchitecture(epicId: string, slug: string, content: string): Promise<void> {
    const archPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "architecture.md");
    await this.adapter.writeText(archPath, content);
  }

  async readStories(epicId: string, slug: string): Promise<StoriesFile | null> {
    const storiesPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "stories.json");
    return this.adapter.readJson(storiesPath, StoriesFileSchema);
  }

  async writeStories(epicId: string, slug: string, stories: StoriesFile): Promise<void> {
    const storiesPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "stories.json");
    await this.adapter.writeJson(storiesPath, stories);
  }

  async createEpicDir(epicId: string, slug: string): Promise<void> {
    const dir = path.join(PATHS.epics.dir, `${epicId}-${slug}`);
    await this.adapter.ensureDirectory(dir);
  }

  // --------------------------------------------------------------------------
  // Element Discovery (Epic/Milestone)
  // --------------------------------------------------------------------------

  async readEpicDiscovery(epicId: string, slug: string): Promise<ElementDiscovery | null> {
    const discoveryPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "discovery.json");
    return this.adapter.readJson(discoveryPath, ElementDiscoverySchema);
  }

  async writeEpicDiscovery(epicId: string, slug: string, data: ElementDiscovery): Promise<void> {
    const discoveryPath = path.join(PATHS.epics.dir, `${epicId}-${slug}`, "discovery.json");
    data.updated = new Date().toISOString();
    await this.adapter.writeJson(discoveryPath, data);
  }

  getMilestoneDir(milestoneId: string): string {
    return this.getPath(path.join(PATHS.milestones.dir, milestoneId));
  }

  async readMilestoneDiscovery(milestoneId: string): Promise<ElementDiscovery | null> {
    const discoveryPath = path.join(PATHS.milestones.dir, milestoneId, "discovery.json");
    return this.adapter.readJson(discoveryPath, ElementDiscoverySchema);
  }

  async writeMilestoneDiscovery(milestoneId: string, data: ElementDiscovery): Promise<void> {
    const discoveryPath = path.join(PATHS.milestones.dir, milestoneId, "discovery.json");
    // Ensure milestone directory exists
    await this.adapter.ensureDirectory(path.join(PATHS.milestones.dir, milestoneId));
    data.updated = new Date().toISOString();
    await this.adapter.writeJson(discoveryPath, data);
  }

  // --------------------------------------------------------------------------
  // Queues
  // --------------------------------------------------------------------------

  async readTaskQueue(): Promise<TaskQueue | null> {
    return this.adapter.readJson(PATHS.taskQueue, TaskQueueSchema);
  }

  async writeTaskQueue(queue: TaskQueue): Promise<void> {
    await this.adapter.writeJson(PATHS.taskQueue, queue);
  }

  async readStuckQueue(): Promise<StuckQueue | null> {
    return this.adapter.readJson(PATHS.stuckQueue, StuckQueueSchema);
  }

  async writeStuckQueue(queue: StuckQueue): Promise<void> {
    await this.adapter.writeJson(PATHS.stuckQueue, queue);
  }

  async readFeedbackQueue(): Promise<FeedbackQueue | null> {
    return this.adapter.readJson(PATHS.feedbackQueue, FeedbackQueueSchema);
  }

  async writeFeedbackQueue(queue: FeedbackQueue): Promise<void> {
    await this.adapter.writeJson(PATHS.feedbackQueue, queue);
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  async readCoverage(): Promise<Coverage | null> {
    return this.adapter.readJson(PATHS.validation.coverage, CoverageSchema);
  }

  async writeCoverage(coverage: Coverage): Promise<void> {
    await this.adapter.writeJson(PATHS.validation.coverage, coverage);
  }

  async readLinks(): Promise<Links | null> {
    return this.adapter.readJson(PATHS.validation.links, LinksSchema);
  }

  async writeLinks(links: Links): Promise<void> {
    await this.adapter.writeJson(PATHS.validation.links, links);
  }

  async readValidationIssues(): Promise<ValidationIssues | null> {
    return this.adapter.readJson(PATHS.validation.issues, ValidationIssuesSchema);
  }

  async writeValidationIssues(issues: ValidationIssues): Promise<void> {
    await this.adapter.writeJson(PATHS.validation.issues, issues);
  }

  // --------------------------------------------------------------------------
  // Lock
  // --------------------------------------------------------------------------

  async acquireLock(holder: "worker" | "user" | "system", task?: string): Promise<boolean> {
    return this.adapter.acquireLock(holder, task);
  }

  async releaseLock(): Promise<void> {
    return this.adapter.releaseLock();
  }

  async readLock(): Promise<Lock | null> {
    return this.adapter.readLock();
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  async exists(relativePath: string): Promise<boolean> {
    return this.adapter.exists(relativePath);
  }

  async listDirectory(relativePath: string): Promise<string[]> {
    return this.adapter.list(relativePath);
  }

  // --------------------------------------------------------------------------
  // Derived Status Functions
  // --------------------------------------------------------------------------

  /**
   * Derive epic status from artifacts and stories.
   * Status is computed, not stored.
   */
  async deriveEpicStatus(epic: Epic, stories: Story[] | null): Promise<DerivedEpicStatus> {
    // Check explicit deferred flag first
    if (epic.deferred) {
      return "deferred";
    }

    // Check artifacts
    const hasPrd = epic.artifacts.prd.status === "complete";
    const hasArch = epic.artifacts.architecture.status === "complete";
    const hasStories = stories && stories.length > 0;

    // No artifacts yet
    if (!hasPrd && !hasArch && !hasStories) {
      return "planned";
    }

    // Has some artifacts but no stories
    if (!hasStories) {
      return "drafting";
    }

    // Has stories - check their statuses
    const storyStatuses = stories.map((s) => s.status);

    // All done
    if (storyStatuses.every((s) => s === "done")) {
      return "done";
    }

    // Any in progress
    if (storyStatuses.some((s) => ["in_progress", "review", "assigned"].includes(s))) {
      return "in_progress";
    }

    // Has stories but none started
    return "ready";
  }

  /**
   * Derive milestone status from epic statuses.
   * Status is computed, not stored.
   */
  async deriveMilestoneStatus(milestone: Milestone): Promise<DerivedMilestoneStatus> {
    if (milestone.epics.length === 0) {
      return "planned";
    }

    const epicStatuses: DerivedEpicStatus[] = [];

    for (const epicId of milestone.epics) {
      // Find epic directory
      const epicDirs = await this.listEpicDirs();
      const epicDir = epicDirs.find((d) => d.startsWith(`${epicId}-`));

      if (epicDir) {
        const slug = epicDir.split("-").slice(1).join("-");
        const epic = await this.readEpic(epicId, slug);
        const storiesFile = await this.readStories(epicId, slug);
        const stories = storiesFile?.stories || null;

        if (epic) {
          const status = await this.deriveEpicStatus(epic, stories);
          epicStatuses.push(status);
        }
      }
    }

    // All done
    if (epicStatuses.length > 0 && epicStatuses.every((s) => s === "done")) {
      return "done";
    }

    // Any in progress (including drafting and ready)
    if (epicStatuses.some((s) => ["in_progress", "ready", "drafting"].includes(s))) {
      return "in_progress";
    }

    return "planned";
  }

  /**
   * Get epic with derived status (convenience method).
   */
  async getEpicWithStatus(epicId: string, slug: string): Promise<{ epic: Epic; status: DerivedEpicStatus } | null> {
    const epic = await this.readEpic(epicId, slug);
    if (!epic) return null;

    const storiesFile = await this.readStories(epicId, slug);
    const stories = storiesFile?.stories || null;
    const status = await this.deriveEpicStatus(epic, stories);

    return { epic, status };
  }

  /**
   * Get milestone with derived status (convenience method).
   */
  async getMilestoneWithStatus(milestone: Milestone): Promise<{ milestone: Milestone; status: DerivedMilestoneStatus }> {
    const status = await this.deriveMilestoneStatus(milestone);
    return { milestone, status };
  }

  // --------------------------------------------------------------------------
  // Context Package Assembly
  // --------------------------------------------------------------------------
  // These methods assemble hierarchical context for each layer.
  // Each layer includes all parent context, ensuring LLM sessions have
  // complete visibility regardless of memory. See AD-016.

  /**
   * Assemble project-level context.
   * Used for milestone planning.
   */
  async assembleProjectContext(): Promise<ProjectContext> {
    const project = await this.readProject();
    if (!project) {
      throw new LisaError("Project not initialized", "NOT_INITIALIZED");
    }

    return {
      project,
      discovery: await this.readDiscoveryContext(),
      constraints: await this.readConstraints(),
      config: await this.readConfig(),
    };
  }

  /**
   * Assemble milestone-level context.
   * Used for epic generation within a milestone.
   */
  async assembleMilestoneContext(milestoneId: string): Promise<MilestoneContext> {
    const projectContext = await this.assembleProjectContext();

    // Find milestone
    const index = await this.readMilestoneIndex();
    const milestone = index?.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new LisaError(`Milestone ${milestoneId} not found`, "NOT_FOUND");
    }

    // Get milestone discovery (optional)
    const milestoneDiscovery = await this.readMilestoneDiscovery(milestoneId);

    // Get sibling epics for context
    const siblingEpics: MilestoneContext["siblingEpics"] = [];
    for (const epicId of milestone.epics) {
      const epicDirs = await this.listEpicDirs();
      const epicDir = epicDirs.find((d) => d.startsWith(`${epicId}-`));
      if (epicDir) {
        const slug = epicDir.split("-").slice(1).join("-");
        const epic = await this.readEpic(epicId, slug);
        if (epic) {
          siblingEpics.push({
            id: epic.id,
            name: epic.name,
            description: epic.description,
          });
        }
      }
    }

    return {
      project: projectContext,
      milestone,
      milestoneDiscovery,
      siblingEpics,
    };
  }

  /**
   * Assemble epic-level context.
   * Used for PRD and architecture generation.
   */
  async assembleEpicContext(epicId: string): Promise<EpicContext> {
    // Find epic
    const epicDirs = await this.listEpicDirs();
    const epicDir = epicDirs.find((d) => d.startsWith(`${epicId}-`));
    if (!epicDir) {
      throw new LisaError(`Epic ${epicId} not found`, "NOT_FOUND");
    }

    const slug = epicDir.split("-").slice(1).join("-");
    const epic = await this.readEpic(epicId, slug);
    if (!epic) {
      throw new LisaError(`Epic ${epicId} not found`, "NOT_FOUND");
    }

    // Get project context
    const projectContext = await this.assembleProjectContext();

    // Find milestone
    const index = await this.readMilestoneIndex();
    const milestone = index?.milestones.find((m) => m.id === epic.milestone);
    if (!milestone) {
      throw new LisaError(`Milestone ${epic.milestone} not found`, "NOT_FOUND");
    }

    const milestoneDiscovery = await this.readMilestoneDiscovery(epic.milestone);
    const epicDiscovery = await this.readEpicDiscovery(epicId, slug);

    // Resolve dependencies
    const dependencies: EpicContext["dependencies"] = [];
    for (const depId of epic.dependencies) {
      const depDir = epicDirs.find((d) => d.startsWith(`${depId}-`));
      if (depDir) {
        const depSlug = depDir.split("-").slice(1).join("-");
        const depEpic = await this.readEpic(depId, depSlug);
        if (depEpic) {
          dependencies.push({
            id: depEpic.id,
            name: depEpic.name,
            description: depEpic.description,
            hasPrd: depEpic.artifacts.prd.status === "complete",
            hasArchitecture: depEpic.artifacts.architecture.status === "complete",
          });
        }
      }
    }

    return {
      project: projectContext,
      milestone,
      milestoneDiscovery,
      epic,
      epicDiscovery,
      dependencies,
    };
  }

  /**
   * Assemble story-level context.
   * Used for story generation. Requires PRD and architecture to exist.
   */
  async assembleStoryContext(epicId: string): Promise<StoryContext> {
    const epicContext = await this.assembleEpicContext(epicId);

    // Find epic directory
    const epicDirs = await this.listEpicDirs();
    const epicDir = epicDirs.find((d) => d.startsWith(`${epicId}-`));
    if (!epicDir) {
      throw new LisaError(`Epic ${epicId} not found`, "NOT_FOUND");
    }
    const slug = epicDir.split("-").slice(1).join("-");

    // Read artifacts (required for story generation)
    const prd = await this.readPrd(epicId, slug);
    if (!prd) {
      throw new LisaError(
        `PRD not found for ${epicId}. Generate PRD first.`,
        "MISSING_PRD"
      );
    }

    const architecture = await this.readArchitecture(epicId, slug);
    if (!architecture) {
      throw new LisaError(
        `Architecture not found for ${epicId}. Generate architecture first.`,
        "MISSING_ARCH"
      );
    }

    // Extract requirements from PRD
    const requirements = this.extractRequirementsFromPrd(prd, epicId);

    return {
      project: epicContext.project,
      milestone: epicContext.milestone,
      milestoneDiscovery: epicContext.milestoneDiscovery,
      epic: epicContext.epic,
      epicDiscovery: epicContext.epicDiscovery,
      prd,
      architecture,
      requirements,
    };
  }

  /**
   * Helper: Extract requirements from PRD markdown.
   * Looks for patterns like "### R1: Title" or "### E1.R1: Title"
   */
  private extractRequirementsFromPrd(
    prd: string,
    epicId: string
  ): StoryContext["requirements"] {
    const requirements: StoryContext["requirements"] = [];

    // Match ### R1: Title or ### E1.R1: Title
    const reqPattern = /^### (?:E\d+\.)?R(\d+):\s*(.+)$/gm;
    let match;

    while ((match = reqPattern.exec(prd)) !== null) {
      const reqNum = match[1];
      const title = match[2].trim();
      requirements.push({
        id: `${epicId}.R${reqNum}`,
        title,
      });
    }

    return requirements;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let stateManager: StateManager | null = null;

export function getStateManager(rootDir?: string): StateManager {
  if (!stateManager || rootDir) {
    const adapter = new FileSystemStateAdapter({ root: rootDir });
    stateManager = new StateManager(adapter);
  }
  return stateManager;
}

/**
 * Create a new StateManager with a custom adapter.
 * Use this when you need a non-default adapter (e.g., for testing or future backends).
 */
export function createStateManager(adapter: StateAdapter): StateManager {
  return new StateManager(adapter);
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetStateManager(): void {
  stateManager = null;
}
