/**
 * Lisa Engine - Core Planning Engine
 *
 * The engine orchestrates commands and provides a unified interface
 * for CLI, skills, and programmatic access.
 */

import { StateManager, getStateManager, createStateManager } from "./state.js";
import { StateAdapter } from "../adapters/state/index.js";
import { CommandResult, CommandOptions } from "./types.js";

// Import commands
import * as statusCommands from "./commands/status.js";
import * as discoverCommands from "./commands/discover.js";
import * as planCommands from "./commands/plan.js";
import * as feedbackCommands from "./commands/feedback.js";
import * as validateCommands from "./commands/validate.js";
import { Story, StoryStatus, FeedbackType } from "./schemas.js";

/**
 * Command registry type
 */
type CommandHandler<TOptions = CommandOptions, TResult = unknown> = (
  state: StateManager,
  options: TOptions
) => Promise<CommandResult<TResult>>;

/**
 * Options for creating a LisaEngine instance.
 */
export interface LisaEngineOptions {
  /**
   * Root directory for the filesystem adapter.
   * Ignored if a custom adapter is provided.
   */
  rootDir?: string;

  /**
   * Custom state adapter for persistence.
   * If not provided, defaults to FileSystemStateAdapter.
   */
  adapter?: StateAdapter;
}

/**
 * Lisa Engine - the core planning engine
 *
 * Usage:
 * ```typescript
 * const engine = new LisaEngine();
 *
 * // Execute commands
 * const result = await engine.status.overview();
 * const result = await engine.discover.start({ depth: 'standard' });
 *
 * // With custom adapter (for future backends)
 * const engine = new LisaEngine({ adapter: myDatabaseAdapter });
 * ```
 */
export class LisaEngine {
  private state: StateManager;

  constructor(options?: LisaEngineOptions | string) {
    // Support legacy string argument for backwards compatibility
    if (typeof options === "string") {
      this.state = getStateManager(options);
    } else if (options?.adapter) {
      this.state = createStateManager(options.adapter);
    } else {
      this.state = getStateManager(options?.rootDir);
    }
  }

  /**
   * Get the state manager for direct access if needed
   */
  getState(): StateManager {
    return this.state;
  }

  // ==========================================================================
  // Status Commands
  // ==========================================================================

  readonly status = {
    /**
     * Get project overview
     */
    overview: () => statusCommands.overview(this.state),

    /**
     * Get kanban board view
     */
    board: (epicFilter?: string) => statusCommands.board(this.state, { epicFilter }),

    /**
     * Get story details
     */
    story: (storyId: string) => statusCommands.story(this.state, { storyId }),

    /**
     * Get hierarchical context
     */
    context: (options: {
      target?: string;
      full?: boolean;
      format?: "text" | "json";
    } = {}) => statusCommands.context(this.state, options),

    /**
     * Explain story lineage (why does this story exist?)
     */
    why: (storyId: string) => statusCommands.why(this.state, { storyId }),

    /**
     * Get implementation guidance for a story
     */
    how: (storyId: string) => statusCommands.how(this.state, { storyId }),
  };

  // ==========================================================================
  // Discovery Commands
  // ==========================================================================

  readonly discover = {
    /**
     * Initialize a new project
     */
    init: (name: string) => discoverCommands.init(this.state, { name }),

    /**
     * Start or continue discovery conversation
     */
    start: (options: { depth?: "quick" | "standard" | "deep" } = {}) =>
      discoverCommands.start(this.state, options),

    /**
     * Add a discovery entry
     */
    addEntry: (options: {
      category: "problem" | "vision" | "users" | "values" | "constraints" | "success" | "other";
      question: string;
      answer: string;
    }) => discoverCommands.addEntry(this.state, options),

    /**
     * Show discovery status
     */
    status: () => discoverCommands.status(this.state),

    /**
     * Start element-level discovery (for milestones/epics)
     */
    element: (options: {
      elementType: "milestone" | "epic";
      elementId: string;
    }) => discoverCommands.element(this.state, options),

    /**
     * Add entry to element discovery
     */
    addElementEntry: (options: {
      elementType: "milestone" | "epic";
      elementId: string;
      category: "problem" | "vision" | "users" | "values" | "constraints" | "success" | "other";
      question: string;
      answer: string;
    }) => discoverCommands.addElementEntry(this.state, options),

    /**
     * Complete element discovery
     */
    completeElement: (options: {
      elementType: "milestone" | "epic";
      elementId: string;
    }) => discoverCommands.completeElement(this.state, options),

    /**
     * Show discovery history (all Q&A entries)
     */
    history: () => discoverCommands.history(this.state),
  };

  // ==========================================================================
  // Plan Commands
  // ==========================================================================

  readonly plan = {
    /**
     * Show milestones
     */
    milestones: () => planCommands.showMilestones(this.state),

    /**
     * Add a milestone
     */
    addMilestone: (options: { name: string; description: string }) =>
      planCommands.addMilestone(this.state, options),

    /**
     * Show epics for a milestone
     */
    epics: (milestoneId?: string) =>
      planCommands.showEpics(this.state, { milestoneId }),

    /**
     * Add an epic to a milestone
     */
    addEpic: (options: { milestoneId: string; name: string; description: string }) =>
      planCommands.addEpic(this.state, options),

    /**
     * Plan an epic (shows current state and next steps)
     */
    epic: (epicId: string) => planCommands.planEpic(this.state, { epicId }),

    /**
     * Save PRD for an epic
     */
    savePrd: (options: { epicId: string; content: string }) =>
      planCommands.savePrd(this.state, options),

    /**
     * Save architecture for an epic
     */
    saveArchitecture: (options: { epicId: string; content: string }) =>
      planCommands.saveArchitecture(this.state, options),

    /**
     * Show stories for an epic
     */
    stories: (epicId: string) => planCommands.showStories(this.state, { epicId }),

    /**
     * Add a story to an epic
     */
    addStory: (options: {
      epicId: string;
      title: string;
      description: string;
      requirements: string[];
      criteria: string[];
    }) => planCommands.addStory(this.state, options),

    /**
     * Save all stories for an epic at once
     */
    saveStories: (options: { epicId: string; stories: Story[] }) =>
      planCommands.saveStories(this.state, options),

    /**
     * Mark stories as complete for an epic
     */
    markStoriesComplete: (epicId: string) =>
      planCommands.markStoriesComplete(this.state, { epicId }),
  };

  // ==========================================================================
  // Feedback Commands
  // ==========================================================================

  readonly feedback = {
    /**
     * Mark a story with a new status
     */
    mark: (options: { storyId: string; status: StoryStatus; reason?: string }) =>
      feedbackCommands.markStory(this.state, options),

    /**
     * Add feedback for a story
     */
    add: (options: { storyId: string; type: FeedbackType; message: string }) =>
      feedbackCommands.addFeedback(this.state, options),

    /**
     * List all pending feedback
     */
    list: () => feedbackCommands.listFeedback(this.state),

    /**
     * Resolve a feedback item
     */
    resolve: (options: { feedbackId: string; resolution?: string }) =>
      feedbackCommands.resolveFeedback(this.state, options),

    /**
     * Dismiss a feedback item
     */
    dismiss: (feedbackId: string) =>
      feedbackCommands.dismissFeedback(this.state, { feedbackId }),
  };

  // ==========================================================================
  // Validate Commands
  // ==========================================================================

  readonly validate = {
    /**
     * Run full validation (schemas, links, coverage)
     */
    all: () => validateCommands.runFullValidation(this.state),

    /**
     * Validate links only
     */
    links: () => validateCommands.validateLinks(this.state),

    /**
     * Validate coverage only
     */
    coverage: () => validateCommands.validateCoverage(this.state),

    /**
     * Validate a specific epic
     */
    epic: (epicId: string) => validateCommands.validateEpic(this.state, { epicId }),
  };
}

/**
 * Create a new Lisa engine instance
 */
export function createEngine(options?: LisaEngineOptions | string): LisaEngine {
  return new LisaEngine(options);
}


// Re-export types for convenience
export type { CommandResult, AIGuidance, OutputSection } from "./types.js";
