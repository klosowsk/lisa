import { z } from "zod";

// Note: We use z.output<typeof Schema> for types to get the post-parse types
// with defaults applied. This ensures type compatibility across the codebase.

// ============================================================================
// Core Enums
// ============================================================================

export const ProjectStatus = z.enum([
  "active",   // Default - work can happen
  "paused",   // Explicit human decision to stop
  "complete", // All milestones done
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

// Derived epic status - computed at runtime, not stored
export const DerivedEpicStatus = z.enum([
  "planned",     // No artifacts yet
  "drafting",    // Has PRD or architecture, but no stories
  "ready",       // Has stories, none started
  "in_progress", // Some stories in progress
  "done",        // All stories done
  "deferred",    // Explicitly put on hold
]);
export type DerivedEpicStatus = z.infer<typeof DerivedEpicStatus>;

// Derived milestone status - computed from epic statuses
export const DerivedMilestoneStatus = z.enum([
  "planned",     // All epics planned
  "in_progress", // Some epics in progress
  "done",        // All epics done
]);
export type DerivedMilestoneStatus = z.infer<typeof DerivedMilestoneStatus>;

export const StoryStatus = z.enum([
  "todo",
  "assigned",
  "in_progress",
  "review",
  "done",
  "blocked",
  "deferred",
]);
export type StoryStatus = z.infer<typeof StoryStatus>;

export const ArtifactStatus = z.enum([
  "pending",
  "in_progress",
  "complete",
  "needs_review",
  "needs_update",
]);
export type ArtifactStatus = z.infer<typeof ArtifactStatus>;

export const FeedbackType = z.enum([
  "blocker",
  "gap",
  "scope",
  "conflict",
  "question",
]);
export type FeedbackType = z.infer<typeof FeedbackType>;

export const TaskType = z.enum([
  "discovery",
  "generate_milestones",
  "generate_epics",
  "generate_prd",
  "generate_architecture",
  "generate_stories",
  "validate",
  "incorporate_feedback",
  "human_review",
]);
export type TaskType = z.infer<typeof TaskType>;

// ============================================================================
// Project
// ============================================================================

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  status: ProjectStatus,
  current_focus: z.string().optional(),
  stats: z.object({
    milestones: z.number(),
    epics: z.number(),
    stories: z.number(),
    completed_stories: z.number(),
  }),
});
export type Project = z.infer<typeof ProjectSchema>;

// ============================================================================
// Discovery
// ============================================================================

export const ValueSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.number(),
});
export type Value = z.infer<typeof ValueSchema>;

export const DiscoveryContextSchema = z.object({
  problem: z.string().optional(),
  vision: z.string().optional(),
  values: z.array(ValueSchema).default([]),
  success_criteria: z.array(z.string()).default([]),
  gathered: z.string().datetime().optional(),
});
export type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;

export const ConstraintSchema = z.object({
  id: z.string(),
  type: z.enum(["technical", "resource", "frozen", "business", "timeline"]),
  constraint: z.string(),
  reason: z.string().optional(),
  impact: z.array(z.string()).default([]),
});
export type Constraint = z.infer<typeof ConstraintSchema>;

export const ConstraintsSchema = z.object({
  constraints: z.array(ConstraintSchema).default([]),
  gathered: z.string().datetime().optional(),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const DiscoveryHistoryEntrySchema = z.object({
  timestamp: z.string().datetime(),
  question: z.string(),
  answer: z.string(),
  category: z.enum(["problem", "vision", "users", "values", "constraints", "success", "other"]),
});
export type DiscoveryHistoryEntry = z.infer<typeof DiscoveryHistoryEntrySchema>;

export const DiscoveryDepth = z.enum(["quick", "standard", "deep"]);
export type DiscoveryDepth = z.infer<typeof DiscoveryDepth>;

export const DiscoveryHistorySchema = z.object({
  entries: z.array(DiscoveryHistoryEntrySchema).default([]),
  started: z.string().datetime().optional(),
  completed: z.string().datetime().optional(),
  is_complete: z.boolean().default(false),
  // Depth preference - affects which topics Claude explores
  depth_preference: DiscoveryDepth.optional(),
  // Last activity timestamp for continuous discovery
  last_active: z.string().datetime().optional(),
});
export type DiscoveryHistory = z.infer<typeof DiscoveryHistorySchema>;

// ============================================================================
// Element Discovery (Nested Discovery for Milestones/Epics)
// ============================================================================

export const DiscoveryStatus = z.enum([
  "not_started",
  "in_progress",
  "complete",
  "skipped",
]);
export type DiscoveryStatus = z.infer<typeof DiscoveryStatus>;

export const DiscoverySource = z.enum([
  "ai_proposed",
  "user_added",
  "feedback",
]);
export type DiscoverySource = z.infer<typeof DiscoverySource>;

export const ElementDiscoverySchema = z.object({
  element_type: z.enum(["milestone", "epic", "story"]),
  element_id: z.string(),
  problem: z.string().optional(),
  scope: z.array(z.string()).default([]),
  out_of_scope: z.array(z.string()).default([]),
  success_criteria: z.array(z.string()).default([]),
  constraints: z.array(ConstraintSchema).default([]),
  history: z.array(DiscoveryHistoryEntrySchema).default([]),
  status: DiscoveryStatus,
  source: DiscoverySource,
  created: z.string().datetime(),
  updated: z.string().datetime(),
});
export type ElementDiscovery = z.output<typeof ElementDiscoverySchema>;

// ============================================================================
// Milestones
// ============================================================================

export const MilestoneSchema = z.object({
  id: z.string(), // M1, M2, etc.
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  order: z.number(),
  // status REMOVED - derived at runtime from epic statuses
  epics: z.array(z.string()).default([]), // Epic IDs
  created: z.string().datetime(),
  updated: z.string().datetime(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const MilestoneIndexSchema = z.object({
  milestones: z.array(MilestoneSchema).default([]),
});
export type MilestoneIndex = z.infer<typeof MilestoneIndexSchema>;

// ============================================================================
// Epics
// ============================================================================

export const ArtifactMetaSchema = z.object({
  status: ArtifactStatus,
  version: z.number().default(1),
  last_updated: z.string().datetime().optional(),
});
export type ArtifactMeta = z.infer<typeof ArtifactMetaSchema>;

export const EpicSchema = z.object({
  id: z.string(), // E1, E2, etc.
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  milestone: z.string(), // M1, M2, etc.
  // status REMOVED - derived at runtime from artifacts/stories
  deferred: z.boolean().default(false), // Only explicit flag needed
  created: z.string().datetime(),
  updated: z.string().datetime(),
  artifacts: z.object({
    prd: ArtifactMetaSchema,
    architecture: ArtifactMetaSchema,
    stories: z.object({
      status: ArtifactStatus,
      count: z.number().default(0),
    }),
  }),
  dependencies: z.array(z.string()).default([]),
  stats: z.object({
    requirements: z.number().default(0),
    stories: z.number().default(0),
    coverage: z.number().default(0),
  }),
});
export type Epic = z.infer<typeof EpicSchema>;

// ============================================================================
// Stories
// ============================================================================

export const StorySchema = z.object({
  id: z.string(), // E1.S1, E1.S2, etc.
  title: z.string(),
  description: z.string(),
  type: z.enum(["feature", "bug", "chore", "spike"]),
  requirements: z.array(z.string()).default([]), // E1.R1, E1.R2, etc.
  acceptance_criteria: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]), // Other story IDs
  estimated_points: z.number().optional(),
  status: StoryStatus,
  assignee: z.string().nullable().default(null),
  blocked_reason: z.string().optional(),
});
export type Story = z.infer<typeof StorySchema>;

export const StoriesFileSchema = z.object({
  epic_id: z.string(),
  stories: z.array(StorySchema).default([]),
  coverage: z.record(z.string(), z.array(z.string())).default({}), // R1 -> [S1, S2]
  validation: z.object({
    coverage_complete: z.boolean().default(false),
    all_links_valid: z.boolean().default(false),
    last_validated: z.string().datetime().optional(),
  }),
});
export type StoriesFile = z.infer<typeof StoriesFileSchema>;

// ============================================================================
// Queues
// ============================================================================

export const TaskTargetSchema = z.object({
  type: z.enum(["project", "milestone", "epic", "story"]),
  id: z.string(),
  name: z.string().optional(),
});
export type TaskTarget = z.infer<typeof TaskTargetSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  type: TaskType,
  target: TaskTargetSchema,
  priority: z.number(),
  status: z.enum(["pending", "in_progress", "complete", "failed"]),
  depends_on: z.array(z.string()).default([]),
  context: z.record(z.string(), z.unknown()).optional(),
  created: z.string().datetime(),
  created_by: z.enum(["system", "user"]),
  completed: z.string().datetime().optional(),
  result: z.string().optional(),
  attempts: z.number().default(0),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskQueueSchema = z.object({
  tasks: z.array(TaskSchema).default([]),
  completed: z.array(TaskSchema).default([]),
});
export type TaskQueue = z.infer<typeof TaskQueueSchema>;

export const StuckItemSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  type: z.string(),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  attempts: z.array(z.object({
    number: z.number(),
    approach: z.string(),
    result: z.string(),
  })).default([]),
  suggested_options: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })).optional(),
  created: z.string().datetime(),
  priority: z.enum(["low", "medium", "high"]),
});
export type StuckItem = z.infer<typeof StuckItemSchema>;

export const StuckQueueSchema = z.object({
  stuck: z.array(StuckItemSchema).default([]),
  resolved: z.array(z.object({
    id: z.string(),
    resolution: z.string(),
    resolved: z.string().datetime(),
    resolved_by: z.enum(["human", "system"]),
  })).default([]),
});
export type StuckQueue = z.infer<typeof StuckQueueSchema>;

export const FeedbackItemSchema = z.object({
  id: z.string(),
  type: FeedbackType,
  source: z.object({
    type: z.enum(["execution", "review", "user"]),
    story_id: z.string().optional(),
    reported_by: z.string().optional(),
  }),
  summary: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  affects: z.array(z.object({
    type: z.enum(["requirement", "architecture", "story", "epic"]),
    id: z.string(),
  })).default([]),
  suggested_actions: z.array(z.string()).optional(),
  status: z.enum(["pending", "incorporated", "dismissed"]),
  created: z.string().datetime(),
});
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;

export const FeedbackQueueSchema = z.object({
  feedback: z.array(FeedbackItemSchema).default([]),
  incorporated: z.array(z.object({
    id: z.string(),
    summary: z.string(),
    incorporated: z.string().datetime(),
    changes_made: z.array(z.string()),
  })).default([]),
});
export type FeedbackQueue = z.infer<typeof FeedbackQueueSchema>;

// ============================================================================
// Validation
// ============================================================================

export const CoverageEntrySchema = z.object({
  stories: z.array(z.string()),
  status: z.enum(["covered", "gap", "partial"]),
});
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

export const CoverageSchema = z.object({
  coverage: z.record(z.string(), z.record(z.string(), CoverageEntrySchema)).default({}),
  summary: z.object({
    total_requirements: z.number(),
    covered: z.number(),
    gaps: z.number(),
    coverage_percent: z.number(),
  }),
  gaps: z.array(z.object({
    requirement: z.string(),
    epic: z.string(),
    text: z.string().optional(),
    reason: z.string().optional(),
  })).default([]),
  last_validated: z.string().datetime().optional(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const LinkSchema = z.object({
  from: z.object({
    type: z.enum(["story", "requirement", "architecture", "epic", "milestone"]),
    id: z.string(),
  }),
  to: z.object({
    type: z.enum(["story", "requirement", "architecture", "epic", "milestone", "constraint", "value"]),
    id: z.string(),
  }),
  type: z.enum(["implements", "depends_on", "respects", "extends", "blocks"]),
  valid: z.boolean(),
});
export type Link = z.infer<typeof LinkSchema>;

export const LinksSchema = z.object({
  links: z.array(LinkSchema).default([]),
  broken: z.array(LinkSchema).default([]),
  orphans: z.array(z.object({
    type: z.string(),
    id: z.string(),
    reason: z.string(),
  })).default([]),
  summary: z.object({
    total_links: z.number(),
    valid: z.number(),
    broken: z.number(),
    orphans: z.number(),
  }),
  last_validated: z.string().datetime().optional(),
});
export type Links = z.infer<typeof LinksSchema>;

export const ValidationIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  type: z.string(),
  location: z.object({
    type: z.string(),
    id: z.string(),
  }),
  message: z.string(),
  suggestion: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationIssuesSchema = z.object({
  issues: z.array(ValidationIssueSchema).default([]),
  summary: z.object({
    errors: z.number(),
    warnings: z.number(),
    info: z.number(),
  }),
  last_validated: z.string().datetime().optional(),
});
export type ValidationIssues = z.infer<typeof ValidationIssuesSchema>;

// ============================================================================
// Config
// ============================================================================

export const ConfigSchema = z.object({
  project: z.object({
    name: z.string().optional(),
    team_size: z.number().optional(),
  }).optional(),
  grind: z.object({
    max_attempts: z.number().default(5),
    same_issue_threshold: z.number().default(2),
    timeout_minutes: z.number().default(10),
  }).optional(),
  quality: z.object({
    prd: z.array(z.string()).optional(),
    architecture: z.array(z.string()).optional(),
    stories: z.array(z.string()).optional(),
  }).optional(),
  stack: z.record(z.string(), z.string()).optional(),
  checkpoints: z.array(z.string()).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Lock
// ============================================================================

export const LockSchema = z.object({
  holder: z.enum(["worker", "user", "system"]),
  task: z.string().optional(),
  started: z.string().datetime(),
  timeout: z.string().datetime(),
});
export type Lock = z.infer<typeof LockSchema>;

// ============================================================================
// Context Packages
// ============================================================================
// These types assemble hierarchical context for each layer of the system.
// Each layer includes all parent context, ensuring LLM sessions have complete
// visibility regardless of memory. See AD-016.

/**
 * Project-level context - the foundation for all other contexts.
 * Used for milestone planning.
 */
export const ProjectContextSchema = z.object({
  project: ProjectSchema,
  discovery: DiscoveryContextSchema.nullable(),
  constraints: ConstraintsSchema.nullable(),
  config: ConfigSchema.nullable(),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

/**
 * Milestone-level context - includes project context plus milestone-specific discovery.
 * Used for epic generation within a milestone.
 */
export const MilestoneContextSchema = z.object({
  // Inherit project context
  project: ProjectContextSchema,

  // Milestone-specific
  milestone: MilestoneSchema,
  milestoneDiscovery: ElementDiscoverySchema.nullable(),

  // Sibling epics (already in this milestone) for reference
  siblingEpics: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
      })
    )
    .default([]),
});
export type MilestoneContext = z.infer<typeof MilestoneContextSchema>;

/**
 * Epic-level context - includes milestone context plus epic-specific discovery.
 * Used for PRD generation, architecture generation.
 */
export const EpicContextSchema = z.object({
  // Inherit project context
  project: ProjectContextSchema,

  // Milestone context
  milestone: MilestoneSchema,
  milestoneDiscovery: ElementDiscoverySchema.nullable(),

  // Epic-specific
  epic: EpicSchema,
  epicDiscovery: ElementDiscoverySchema.nullable(),

  // Dependencies (other epics this one depends on)
  dependencies: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        hasPrd: z.boolean(),
        hasArchitecture: z.boolean(),
      })
    )
    .default([]),
});
export type EpicContext = z.infer<typeof EpicContextSchema>;

/**
 * Story-level context - includes epic context plus generated artifacts.
 * Used for story generation. Requires PRD and architecture to exist.
 */
export const StoryContextSchema = z.object({
  // Inherit project context
  project: ProjectContextSchema,

  // Milestone context
  milestone: MilestoneSchema,
  milestoneDiscovery: ElementDiscoverySchema.nullable(),

  // Epic context
  epic: EpicSchema,
  epicDiscovery: ElementDiscoverySchema.nullable(),

  // Generated artifacts
  prd: z.string(),
  architecture: z.string(),

  // Extracted from PRD for easy reference
  requirements: z
    .array(
      z.object({
        id: z.string(), // E1.R1
        title: z.string(),
        description: z.string().optional(),
      })
    )
    .default([]),
});
export type StoryContext = z.infer<typeof StoryContextSchema>;
