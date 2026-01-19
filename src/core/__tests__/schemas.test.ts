import { describe, it, expect } from "vitest";
import {
  ProjectSchema,
  ProjectStatus,
  DerivedEpicStatus,
  DerivedMilestoneStatus,
  StoryStatus,
  ArtifactStatus,
  FeedbackType,
  TaskType,
  DiscoveryContextSchema,
  ConstraintSchema,
  ConstraintsSchema,
  DiscoveryHistorySchema,
  MilestoneSchema,
  MilestoneIndexSchema,
  EpicSchema,
  StorySchema,
  StoriesFileSchema,
  TaskSchema,
  TaskQueueSchema,
  StuckItemSchema,
  StuckQueueSchema,
  FeedbackItemSchema,
  FeedbackQueueSchema,
  CoverageSchema,
  LinkSchema,
  LinksSchema,
  ValidationIssueSchema,
  ValidationIssuesSchema,
  ConfigSchema,
  LockSchema,
  DiscoveryStatus,
  DiscoverySource,
  ElementDiscoverySchema,
} from "../schemas.js";

describe("Core Enums", () => {
  describe("ProjectStatus", () => {
    it("should accept valid statuses", () => {
      expect(ProjectStatus.parse("active")).toBe("active");
      expect(ProjectStatus.parse("paused")).toBe("paused");
      expect(ProjectStatus.parse("complete")).toBe("complete");
    });

    it("should reject invalid statuses", () => {
      expect(() => ProjectStatus.parse("invalid")).toThrow();
    });
  });

  describe("DerivedEpicStatus", () => {
    it("should accept valid statuses", () => {
      expect(DerivedEpicStatus.parse("planned")).toBe("planned");
      expect(DerivedEpicStatus.parse("drafting")).toBe("drafting");
      expect(DerivedEpicStatus.parse("ready")).toBe("ready");
      expect(DerivedEpicStatus.parse("in_progress")).toBe("in_progress");
      expect(DerivedEpicStatus.parse("done")).toBe("done");
      expect(DerivedEpicStatus.parse("deferred")).toBe("deferred");
    });

    it("should reject invalid statuses", () => {
      expect(() => DerivedEpicStatus.parse("invalid")).toThrow();
    });
  });

  describe("DerivedMilestoneStatus", () => {
    it("should accept valid statuses", () => {
      expect(DerivedMilestoneStatus.parse("planned")).toBe("planned");
      expect(DerivedMilestoneStatus.parse("in_progress")).toBe("in_progress");
      expect(DerivedMilestoneStatus.parse("done")).toBe("done");
    });

    it("should reject invalid statuses", () => {
      expect(() => DerivedMilestoneStatus.parse("invalid")).toThrow();
    });
  });

  describe("StoryStatus", () => {
    it("should accept all valid statuses", () => {
      const validStatuses = ["todo", "assigned", "in_progress", "review", "done", "blocked", "deferred"];
      validStatuses.forEach((status) => {
        expect(StoryStatus.parse(status)).toBe(status);
      });
    });
  });

  describe("FeedbackType", () => {
    it("should accept all valid types", () => {
      const validTypes = ["blocker", "gap", "scope", "conflict", "question"];
      validTypes.forEach((type) => {
        expect(FeedbackType.parse(type)).toBe(type);
      });
    });
  });
});

describe("ProjectSchema", () => {
  const validProject = {
    id: "proj-123",
    name: "Test Project",
    created: "2024-01-15T10:00:00.000Z",
    updated: "2024-01-15T10:00:00.000Z",
    status: "active",
    stats: {
      milestones: 2,
      epics: 5,
      stories: 20,
      completed_stories: 8,
    },
  };

  it("should parse valid project", () => {
    const result = ProjectSchema.parse(validProject);
    expect(result.id).toBe("proj-123");
    expect(result.name).toBe("Test Project");
    expect(result.status).toBe("active");
  });

  it("should accept optional description", () => {
    const withDescription = { ...validProject, description: "A test project" };
    const result = ProjectSchema.parse(withDescription);
    expect(result.description).toBe("A test project");
  });

  it("should accept optional current_focus", () => {
    const withFocus = { ...validProject, current_focus: "E3" };
    const result = ProjectSchema.parse(withFocus);
    expect(result.current_focus).toBe("E3");
  });

  it("should reject missing required fields", () => {
    const { id, ...missingId } = validProject;
    expect(() => ProjectSchema.parse(missingId)).toThrow();
  });

  it("should reject invalid status", () => {
    const invalidStatus = { ...validProject, status: "invalid" };
    expect(() => ProjectSchema.parse(invalidStatus)).toThrow();
  });

  it("should accept all project statuses", () => {
    const statuses = ["active", "paused", "complete"];
    statuses.forEach((status) => {
      const result = ProjectSchema.parse({ ...validProject, status });
      expect(result.status).toBe(status);
    });
  });
});

describe("DiscoveryContextSchema", () => {
  it("should parse minimal context", () => {
    const result = DiscoveryContextSchema.parse({});
    expect(result.values).toEqual([]);
    expect(result.success_criteria).toEqual([]);
  });

  it("should parse full context", () => {
    const fullContext = {
      problem: "Users struggle with planning",
      vision: "A seamless planning experience",
      values: [
        { id: "V1", name: "Simplicity", description: "Keep it simple", priority: 1 },
      ],
      success_criteria: ["90% user satisfaction"],
      gathered: "2024-01-15T10:00:00.000Z",
    };
    const result = DiscoveryContextSchema.parse(fullContext);
    expect(result.problem).toBe("Users struggle with planning");
    expect(result.values).toHaveLength(1);
  });

  it("should apply defaults for arrays", () => {
    const result = DiscoveryContextSchema.parse({ problem: "Test" });
    expect(result.values).toEqual([]);
    expect(result.success_criteria).toEqual([]);
  });
});

describe("ConstraintSchema", () => {
  it("should parse valid constraint", () => {
    const constraint = {
      id: "C1",
      type: "technical",
      constraint: "Must use PostgreSQL",
      reason: "Team expertise",
      impact: ["Database choice locked"],
    };
    const result = ConstraintSchema.parse(constraint);
    expect(result.type).toBe("technical");
  });

  it("should accept all constraint types", () => {
    const types = ["technical", "resource", "frozen", "business", "timeline"];
    types.forEach((type) => {
      const result = ConstraintSchema.parse({
        id: "C1",
        type,
        constraint: "Test",
      });
      expect(result.type).toBe(type);
    });
  });

  it("should default impact to empty array", () => {
    const result = ConstraintSchema.parse({
      id: "C1",
      type: "technical",
      constraint: "Test",
    });
    expect(result.impact).toEqual([]);
  });
});

describe("DiscoveryHistorySchema", () => {
  it("should parse with defaults", () => {
    const result = DiscoveryHistorySchema.parse({});
    expect(result.entries).toEqual([]);
    expect(result.is_complete).toBe(false);
  });

  it("should parse full history", () => {
    const history = {
      entries: [
        {
          timestamp: "2024-01-15T10:00:00.000Z",
          question: "What problem?",
          answer: "Planning is hard",
          category: "problem",
        },
      ],
      started: "2024-01-15T10:00:00.000Z",
      completed: "2024-01-15T11:00:00.000Z",
      is_complete: true,
    };
    const result = DiscoveryHistorySchema.parse(history);
    expect(result.entries).toHaveLength(1);
    expect(result.is_complete).toBe(true);
  });
});

describe("MilestoneSchema", () => {
  const validMilestone = {
    id: "M1",
    slug: "foundation",
    name: "Foundation",
    description: "Core infrastructure",
    order: 1,
    epics: ["E1", "E2"],
    created: "2024-01-15T10:00:00.000Z",
    updated: "2024-01-15T10:00:00.000Z",
  };

  it("should parse valid milestone", () => {
    const result = MilestoneSchema.parse(validMilestone);
    expect(result.id).toBe("M1");
    expect(result.epics).toEqual(["E1", "E2"]);
  });

  it("should default epics to empty array", () => {
    const { epics, ...withoutEpics } = validMilestone;
    const result = MilestoneSchema.parse(withoutEpics);
    expect(result.epics).toEqual([]);
  });

  it("should not have status field (status is derived)", () => {
    const result = MilestoneSchema.parse(validMilestone);
    expect((result as Record<string, unknown>).status).toBeUndefined();
  });
});

describe("MilestoneIndexSchema", () => {
  it("should parse with defaults", () => {
    const result = MilestoneIndexSchema.parse({});
    expect(result.milestones).toEqual([]);
  });

  it("should parse index with milestones", () => {
    const index = {
      milestones: [{
        id: "M1",
        slug: "mvp",
        name: "MVP",
        description: "Minimum viable product",
        order: 1,
        epics: [],
        created: "2024-01-15T10:00:00.000Z",
        updated: "2024-01-15T10:00:00.000Z",
      }],
    };
    const result = MilestoneIndexSchema.parse(index);
    expect(result.milestones.length).toBe(1);
  });
});

describe("EpicSchema", () => {
  const validEpic = {
    id: "E1",
    slug: "auth",
    name: "Authentication",
    description: "User authentication system",
    milestone: "M1",
    deferred: false,
    created: "2024-01-15T10:00:00.000Z",
    updated: "2024-01-15T10:00:00.000Z",
    artifacts: {
      prd: { status: "pending", version: 1 },
      architecture: { status: "pending", version: 1 },
      stories: { status: "pending", count: 0 },
    },
    dependencies: [],
    stats: { requirements: 0, stories: 0, coverage: 0 },
  };

  it("should parse valid epic", () => {
    const result = EpicSchema.parse(validEpic);
    expect(result.id).toBe("E1");
    expect(result.deferred).toBe(false);
  });

  it("should default deferred to false", () => {
    const { deferred, ...withoutDeferred } = validEpic;
    const result = EpicSchema.parse(withoutDeferred);
    expect(result.deferred).toBe(false);
  });

  it("should accept deferred flag", () => {
    const result = EpicSchema.parse({ ...validEpic, deferred: true });
    expect(result.deferred).toBe(true);
  });

  it("should not have status field (status is derived)", () => {
    const result = EpicSchema.parse(validEpic);
    expect((result as Record<string, unknown>).status).toBeUndefined();
  });
});

describe("StorySchema", () => {
  const validStory = {
    id: "E1.S1",
    title: "Implement login API",
    description: "Create the login endpoint",
    type: "feature",
    status: "todo",
  };

  it("should parse valid story", () => {
    const result = StorySchema.parse(validStory);
    expect(result.id).toBe("E1.S1");
    expect(result.type).toBe("feature");
  });

  it("should default arrays to empty", () => {
    const result = StorySchema.parse(validStory);
    expect(result.requirements).toEqual([]);
    expect(result.acceptance_criteria).toEqual([]);
    expect(result.dependencies).toEqual([]);
  });

  it("should default assignee to null", () => {
    const result = StorySchema.parse(validStory);
    expect(result.assignee).toBeNull();
  });

  it("should accept all story types", () => {
    const types = ["feature", "bug", "chore", "spike"];
    types.forEach((type) => {
      const result = StorySchema.parse({ ...validStory, type });
      expect(result.type).toBe(type);
    });
  });
});

describe("StoriesFileSchema", () => {
  it("should parse minimal stories file", () => {
    const result = StoriesFileSchema.parse({
      epic_id: "E1",
      validation: { coverage_complete: false, all_links_valid: false },
    });
    expect(result.stories).toEqual([]);
    expect(result.coverage).toEqual({});
  });

  it("should parse full stories file", () => {
    const file = {
      epic_id: "E1",
      stories: [
        { id: "E1.S1", title: "Test", description: "Test", type: "feature", status: "todo" },
      ],
      coverage: { "E1.R1": ["E1.S1"] },
      validation: {
        coverage_complete: true,
        all_links_valid: true,
        last_validated: "2024-01-15T10:00:00.000Z",
      },
    };
    const result = StoriesFileSchema.parse(file);
    expect(result.stories).toHaveLength(1);
  });
});

describe("TaskSchema", () => {
  const validTask = {
    id: "task-001",
    type: "generate_prd",
    target: { type: "epic", id: "E1" },
    priority: 1,
    status: "pending",
    created: "2024-01-15T10:00:00.000Z",
    created_by: "system",
  };

  it("should parse valid task", () => {
    const result = TaskSchema.parse(validTask);
    expect(result.id).toBe("task-001");
    expect(result.type).toBe("generate_prd");
  });

  it("should default attempts to 0", () => {
    const result = TaskSchema.parse(validTask);
    expect(result.attempts).toBe(0);
  });

  it("should accept all task types", () => {
    const types = [
      "discovery", "generate_milestones", "generate_epics",
      "generate_prd", "generate_architecture", "generate_stories",
      "validate", "incorporate_feedback", "human_review",
    ];
    types.forEach((type) => {
      const result = TaskSchema.parse({ ...validTask, type });
      expect(result.type).toBe(type);
    });
  });
});

describe("FeedbackItemSchema", () => {
  const validFeedback = {
    id: "fb-001",
    type: "blocker",
    source: { type: "execution", story_id: "E1.S1" },
    summary: "OAuth requires enterprise plan",
    status: "pending",
    created: "2024-01-15T10:00:00.000Z",
  };

  it("should parse valid feedback", () => {
    const result = FeedbackItemSchema.parse(validFeedback);
    expect(result.id).toBe("fb-001");
    expect(result.type).toBe("blocker");
  });

  it("should accept all feedback types", () => {
    const types = ["blocker", "gap", "scope", "conflict", "question"];
    types.forEach((type) => {
      const result = FeedbackItemSchema.parse({ ...validFeedback, type });
      expect(result.type).toBe(type);
    });
  });
});

describe("CoverageSchema", () => {
  it("should parse coverage with defaults", () => {
    const result = CoverageSchema.parse({
      summary: { total_requirements: 0, covered: 0, gaps: 0, coverage_percent: 0 },
    });
    expect(result.coverage).toEqual({});
    expect(result.gaps).toEqual([]);
  });

  it("should parse full coverage", () => {
    const coverage = {
      coverage: {
        E1: {
          "E1.R1": { stories: ["E1.S1"], status: "covered" },
        },
      },
      summary: { total_requirements: 1, covered: 1, gaps: 0, coverage_percent: 100 },
      gaps: [],
    };
    const result = CoverageSchema.parse(coverage);
    expect(result.summary.coverage_percent).toBe(100);
  });
});

describe("LinkSchema", () => {
  it("should parse valid link", () => {
    const link = {
      from: { type: "story", id: "E1.S1" },
      to: { type: "requirement", id: "E1.R1" },
      type: "implements",
      valid: true,
    };
    const result = LinkSchema.parse(link);
    expect(result.valid).toBe(true);
  });

  it("should accept all link types", () => {
    const types = ["implements", "depends_on", "respects", "extends", "blocks"];
    types.forEach((type) => {
      const result = LinkSchema.parse({
        from: { type: "story", id: "E1.S1" },
        to: { type: "requirement", id: "E1.R1" },
        type,
        valid: true,
      });
      expect(result.type).toBe(type);
    });
  });
});

describe("ValidationIssueSchema", () => {
  it("should parse valid issue", () => {
    const issue = {
      id: "issue-001",
      severity: "error",
      type: "broken_link",
      location: { type: "story", id: "E1.S1" },
      message: "Broken link to requirement",
      suggestion: "Fix the link",
    };
    const result = ValidationIssueSchema.parse(issue);
    expect(result.severity).toBe("error");
  });

  it("should accept all severities", () => {
    const severities = ["error", "warning", "info"];
    severities.forEach((severity) => {
      const result = ValidationIssueSchema.parse({
        id: "issue-001",
        severity,
        type: "test",
        location: { type: "story", id: "E1.S1" },
        message: "Test",
      });
      expect(result.severity).toBe(severity);
    });
  });
});

describe("ConfigSchema", () => {
  it("should parse empty config", () => {
    const result = ConfigSchema.parse({});
    expect(result).toBeDefined();
  });

  it("should parse full config", () => {
    const config = {
      project: { name: "Test", team_size: 5 },
      grind: { max_attempts: 10, same_issue_threshold: 3, timeout_minutes: 15 },
      quality: { prd: ["rule1"], architecture: ["rule2"] },
      stack: { frontend: "React", backend: "Node" },
      checkpoints: ["after_prd"],
    };
    const result = ConfigSchema.parse(config);
    expect(result.project?.team_size).toBe(5);
  });
});

describe("LockSchema", () => {
  it("should parse valid lock", () => {
    const lock = {
      holder: "worker",
      task: "task-001",
      started: "2024-01-15T10:00:00.000Z",
      timeout: "2024-01-15T10:10:00.000Z",
    };
    const result = LockSchema.parse(lock);
    expect(result.holder).toBe("worker");
  });

  it("should accept all holder types", () => {
    const holders = ["worker", "user", "system"];
    holders.forEach((holder) => {
      const result = LockSchema.parse({
        holder,
        started: "2024-01-15T10:00:00.000Z",
        timeout: "2024-01-15T10:10:00.000Z",
      });
      expect(result.holder).toBe(holder);
    });
  });
});

// ============================================================================
// Element Discovery (Nested Discovery)
// ============================================================================

describe("DiscoveryStatus Enum", () => {
  it("should accept all valid statuses", () => {
    const validStatuses = ["not_started", "in_progress", "complete", "skipped"];
    validStatuses.forEach((status) => {
      expect(DiscoveryStatus.parse(status)).toBe(status);
    });
  });

  it("should reject invalid statuses", () => {
    expect(() => DiscoveryStatus.parse("invalid")).toThrow();
    expect(() => DiscoveryStatus.parse("pending")).toThrow();
  });
});

describe("DiscoverySource Enum", () => {
  it("should accept all valid sources", () => {
    const validSources = ["ai_proposed", "user_added", "feedback"];
    validSources.forEach((source) => {
      expect(DiscoverySource.parse(source)).toBe(source);
    });
  });

  it("should reject invalid sources", () => {
    expect(() => DiscoverySource.parse("invalid")).toThrow();
    expect(() => DiscoverySource.parse("manual")).toThrow();
  });
});

describe("ElementDiscoverySchema", () => {
  const validElementDiscovery = {
    element_type: "epic",
    element_id: "E1",
    status: "not_started",
    source: "user_added",
    created: "2024-01-15T10:00:00.000Z",
    updated: "2024-01-15T10:00:00.000Z",
  };

  it("should parse minimal valid element discovery", () => {
    const result = ElementDiscoverySchema.parse(validElementDiscovery);
    expect(result.element_type).toBe("epic");
    expect(result.element_id).toBe("E1");
    expect(result.status).toBe("not_started");
    expect(result.source).toBe("user_added");
  });

  it("should apply defaults for optional arrays", () => {
    const result = ElementDiscoverySchema.parse(validElementDiscovery);
    expect(result.scope).toEqual([]);
    expect(result.out_of_scope).toEqual([]);
    expect(result.success_criteria).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.history).toEqual([]);
  });

  it("should parse full element discovery", () => {
    const fullDiscovery = {
      ...validElementDiscovery,
      problem: "Users need dark mode",
      scope: ["Theme switching", "Color persistence"],
      out_of_scope: ["Custom themes"],
      success_criteria: ["Theme toggles instantly", "Preference persists"],
      constraints: [
        { id: "C1", type: "technical", constraint: "Must use CSS variables", impact: [] },
      ],
      history: [
        {
          timestamp: "2024-01-15T10:00:00.000Z",
          question: "What problem does this solve?",
          answer: "Users want dark mode",
          category: "problem",
        },
      ],
    };
    const result = ElementDiscoverySchema.parse(fullDiscovery);
    expect(result.problem).toBe("Users need dark mode");
    expect(result.scope).toHaveLength(2);
    expect(result.out_of_scope).toHaveLength(1);
    expect(result.success_criteria).toHaveLength(2);
    expect(result.constraints).toHaveLength(1);
    expect(result.history).toHaveLength(1);
  });

  it("should accept all element types", () => {
    const types = ["milestone", "epic", "story"];
    types.forEach((type) => {
      const result = ElementDiscoverySchema.parse({
        ...validElementDiscovery,
        element_type: type,
      });
      expect(result.element_type).toBe(type);
    });
  });

  it("should accept all statuses", () => {
    const statuses = ["not_started", "in_progress", "complete", "skipped"];
    statuses.forEach((status) => {
      const result = ElementDiscoverySchema.parse({
        ...validElementDiscovery,
        status,
      });
      expect(result.status).toBe(status);
    });
  });

  it("should accept all sources", () => {
    const sources = ["ai_proposed", "user_added", "feedback"];
    sources.forEach((source) => {
      const result = ElementDiscoverySchema.parse({
        ...validElementDiscovery,
        source,
      });
      expect(result.source).toBe(source);
    });
  });

  it("should reject missing required fields", () => {
    const { element_type, ...missingType } = validElementDiscovery;
    expect(() => ElementDiscoverySchema.parse(missingType)).toThrow();

    const { status, ...missingStatus } = validElementDiscovery;
    expect(() => ElementDiscoverySchema.parse(missingStatus)).toThrow();

    const { source, ...missingSource } = validElementDiscovery;
    expect(() => ElementDiscoverySchema.parse(missingSource)).toThrow();
  });

  it("should reject invalid element type", () => {
    expect(() => ElementDiscoverySchema.parse({
      ...validElementDiscovery,
      element_type: "invalid",
    })).toThrow();
  });
});
