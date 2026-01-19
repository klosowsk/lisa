import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StateManager, createStateManager } from "../state.js";
import { FileSystemStateAdapter } from "../../adapters/state/index.js";

describe("Discover Script Integration", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-discover-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);

    // Suppress console output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("init command", () => {
    it("should initialize project with name", async () => {
      const project = await state.initialize("My Test Project");

      expect(project.name).toBe("My Test Project");
      expect(project.status).toBe("active");

      // Verify files created
      const isInit = await state.isInitialized();
      expect(isInit).toBe(true);
    });

    it("should create all required directories", async () => {
      await state.initialize("Test");

      const lisaDir = path.join(testDir, ".lisa");
      const directories = [
        "discovery",
        "milestones",
        "epics",
        "validation",
      ];

      for (const dir of directories) {
        const stat = await fs.stat(path.join(lisaDir, dir));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it("should create discovery files", async () => {
      await state.initialize("Test");

      const context = await state.readDiscoveryContext();
      const constraints = await state.readConstraints();
      const history = await state.readDiscoveryHistory();

      expect(context).not.toBeNull();
      expect(constraints).not.toBeNull();
      expect(history).not.toBeNull();
    });
  });

  describe("discovery status", () => {
    it("should show incomplete status for new project", async () => {
      await state.initialize("Test");

      const history = await state.readDiscoveryHistory();
      expect(history?.is_complete).toBe(false);
      expect(history?.entries).toEqual([]);
    });

    it("should show progress based on entries", async () => {
      await state.initialize("Test");

      const history = await state.readDiscoveryHistory();
      history!.entries.push({
        timestamp: new Date().toISOString(),
        question: "What problem are we solving?",
        answer: "Users struggle with planning",
        category: "problem",
      });
      await state.writeDiscoveryHistory(history!);

      const updated = await state.readDiscoveryHistory();
      expect(updated?.entries).toHaveLength(1);
    });
  });

  describe("add entry", () => {
    it("should add discovery entry to history", async () => {
      await state.initialize("Test");

      const history = await state.readDiscoveryHistory();
      const entry = {
        timestamp: new Date().toISOString(),
        question: "What problem?",
        answer: "Planning is hard",
        category: "problem" as const,
      };
      history!.entries.push(entry);
      await state.writeDiscoveryHistory(history!);

      const updated = await state.readDiscoveryHistory();
      expect(updated?.entries).toHaveLength(1);
      expect(updated?.entries[0].answer).toBe("Planning is hard");
    });

    it("should update context for problem category", async () => {
      await state.initialize("Test");

      const context = await state.readDiscoveryContext();
      context!.problem = "Planning is hard";
      await state.writeDiscoveryContext(context!);

      const updated = await state.readDiscoveryContext();
      expect(updated?.problem).toBe("Planning is hard");
    });

    it("should update context for values category", async () => {
      await state.initialize("Test");

      const context = await state.readDiscoveryContext();
      context!.values.push({
        id: "V1",
        name: "Simplicity",
        description: "Keep things simple",
        priority: 1,
      });
      await state.writeDiscoveryContext(context!);

      const updated = await state.readDiscoveryContext();
      expect(updated?.values).toHaveLength(1);
      expect(updated?.values[0].name).toBe("Simplicity");
    });

    it("should update constraints for constraints category", async () => {
      await state.initialize("Test");

      const constraints = await state.readConstraints();
      constraints!.constraints.push({
        id: "C1",
        type: "technical",
        constraint: "Must use PostgreSQL",
        impact: [],
      });
      await state.writeConstraints(constraints!);

      const updated = await state.readConstraints();
      expect(updated?.constraints).toHaveLength(1);
    });

    it("should update success criteria for success category", async () => {
      await state.initialize("Test");

      const context = await state.readDiscoveryContext();
      context!.success_criteria.push("90% user satisfaction");
      await state.writeDiscoveryContext(context!);

      const updated = await state.readDiscoveryContext();
      expect(updated?.success_criteria).toContain("90% user satisfaction");
    });
  });

  describe("complete discovery", () => {
    it("should mark discovery as complete", async () => {
      await state.initialize("Test");

      // Add some discovery data
      const context = await state.readDiscoveryContext();
      context!.problem = "Test problem";
      await state.writeDiscoveryContext(context!);

      const history = await state.readDiscoveryHistory();
      history!.is_complete = true;
      history!.completed = new Date().toISOString();
      await state.writeDiscoveryHistory(history!);

      const updated = await state.readDiscoveryHistory();
      expect(updated?.is_complete).toBe(true);
      expect(updated?.completed).toBeDefined();
    });

    it("should update project status", async () => {
      await state.initialize("Test");

      await state.updateProject({ status: "paused" });

      const project = await state.readProject();
      expect(project?.status).toBe("paused");
    });
  });

  describe("resume discovery", () => {
    it("should allow adding more entries after resuming", async () => {
      await state.initialize("Test");

      // Add first entry
      const history = await state.readDiscoveryHistory();
      history!.entries.push({
        timestamp: new Date().toISOString(),
        question: "Q1",
        answer: "A1",
        category: "problem",
      });
      await state.writeDiscoveryHistory(history!);

      // Resume and add more
      const resumed = await state.readDiscoveryHistory();
      resumed!.entries.push({
        timestamp: new Date().toISOString(),
        question: "Q2",
        answer: "A2",
        category: "values",
      });
      await state.writeDiscoveryHistory(resumed!);

      const final = await state.readDiscoveryHistory();
      expect(final?.entries).toHaveLength(2);
    });
  });
});

describe("Discovery Questions", () => {
  const requiredQuestions = [
    { category: "problem", question: "What problem are we solving?" },
    { category: "problem", question: "What does success look like?" },
    { category: "users", question: "Who are the primary users?" },
    { category: "values", question: "What is the most important quality?" },
    { category: "success", question: "How will we know if this is successful?" },
  ];

  it("should have defined required questions", () => {
    expect(requiredQuestions).toHaveLength(5);
  });

  it("should have valid categories", () => {
    const validCategories = ["problem", "users", "values", "constraints", "success", "other"];
    requiredQuestions.forEach((q) => {
      expect(validCategories).toContain(q.category);
    });
  });
});

// ============================================================================
// Element Discovery (Nested Discovery)
// ============================================================================

describe("Epic Discovery Integration", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-epic-discover-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Initialize project with milestone and epic
    await state.initialize("Test Project");
    const index = await state.readMilestoneIndex();
    index!.milestones.push({
      id: "M1",
      slug: "foundation",
      name: "Foundation",
      description: "Core infrastructure",
      order: 1,
      epics: ["E1"],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    await state.writeMilestoneIndex(index!);

    await state.createEpicDir("E1", "auth");
    await state.writeEpic({
      id: "E1",
      slug: "auth",
      name: "Authentication",
      description: "User authentication",
      milestone: "M1",
      deferred: false,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      artifacts: {
        prd: { status: "pending", version: 1 },
        architecture: { status: "pending", version: 1 },
        stories: { status: "pending", count: 0 },
      },
      dependencies: [],
      stats: { requirements: 0, stories: 0, coverage: 0 },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should create discovery file for epic", async () => {
    const discovery = {
      element_type: "epic" as const,
      element_id: "E1",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [],
      status: "in_progress" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    await state.writeEpicDiscovery("E1", "auth", discovery);

    const read = await state.readEpicDiscovery("E1", "auth");
    expect(read).not.toBeNull();
    expect(read?.element_id).toBe("E1");
    expect(read?.status).toBe("in_progress");
  });

  it("should track discovery history entries", async () => {
    const discovery = {
      element_type: "epic" as const,
      element_id: "E1",
      problem: "Users need login",
      scope: ["Login", "Logout"],
      out_of_scope: [],
      success_criteria: ["Can login"],
      constraints: [],
      history: [
        {
          timestamp: new Date().toISOString(),
          question: "What problem does this epic solve?",
          answer: "Users need login",
          category: "problem" as const,
        },
        {
          timestamp: new Date().toISOString(),
          question: "What's in scope for this epic?",
          answer: "Login, Logout",
          category: "other" as const,
        },
      ],
      status: "in_progress" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    await state.writeEpicDiscovery("E1", "auth", discovery);

    const read = await state.readEpicDiscovery("E1", "auth");
    expect(read?.history).toHaveLength(2);
    expect(read?.problem).toBe("Users need login");
  });

  it("should mark epic discovery as complete", async () => {
    const discovery = {
      element_type: "epic" as const,
      element_id: "E1",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [],
      status: "not_started" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    await state.writeEpicDiscovery("E1", "auth", discovery);

    // Mark as complete
    const read = await state.readEpicDiscovery("E1", "auth");
    read!.status = "complete";
    await state.writeEpicDiscovery("E1", "auth", read!);

    const updated = await state.readEpicDiscovery("E1", "auth");
    expect(updated?.status).toBe("complete");
  });

  it("should mark epic discovery as skipped", async () => {
    const discovery = {
      element_type: "epic" as const,
      element_id: "E1",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [],
      status: "skipped" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    await state.writeEpicDiscovery("E1", "auth", discovery);

    const read = await state.readEpicDiscovery("E1", "auth");
    expect(read?.status).toBe("skipped");
  });
});

describe("Milestone Discovery Integration", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-milestone-discover-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await state.initialize("Test Project");
    const index = await state.readMilestoneIndex();
    index!.milestones.push({
      id: "M1",
      slug: "foundation",
      name: "Foundation",
      description: "Core infrastructure",
      order: 1,
      epics: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    await state.writeMilestoneIndex(index!);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should create discovery file for milestone", async () => {
    const discovery = {
      element_type: "milestone" as const,
      element_id: "M1",
      scope: [],
      out_of_scope: [],
      success_criteria: ["Foundation complete"],
      constraints: [],
      history: [],
      status: "in_progress" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    await state.writeMilestoneDiscovery("M1", discovery);

    const read = await state.readMilestoneDiscovery("M1");
    expect(read).not.toBeNull();
    expect(read?.element_id).toBe("M1");
    expect(read?.success_criteria).toEqual(["Foundation complete"]);
  });

  it("should track milestone discovery history", async () => {
    const discovery = {
      element_type: "milestone" as const,
      element_id: "M1",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [
        {
          timestamp: new Date().toISOString(),
          question: "What's the goal of this milestone?",
          answer: "Build core infrastructure",
          category: "vision" as const,
        },
      ],
      status: "in_progress" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    await state.writeMilestoneDiscovery("M1", discovery);

    const read = await state.readMilestoneDiscovery("M1");
    expect(read?.history).toHaveLength(1);
    expect(read?.history[0].category).toBe("vision");
  });

  it("should store milestone entries in milestone discovery, not project discovery", async () => {
    // First add an entry to project-level discovery
    const projectHistory = await state.readDiscoveryHistory();
    projectHistory!.entries.push({
      timestamp: new Date().toISOString(),
      question: "What is the project about?",
      answer: "A planning tool",
      category: "problem",
    });
    await state.writeDiscoveryHistory(projectHistory!);

    // Then add milestone-specific entry to milestone discovery
    const milestoneDiscovery = {
      element_type: "milestone" as const,
      element_id: "M1",
      scope: ["Core infrastructure"],
      out_of_scope: [],
      success_criteria: ["Foundation complete"],
      constraints: [],
      history: [
        {
          timestamp: new Date().toISOString(),
          question: "What are the success criteria for M1?",
          answer: "Foundation complete",
          category: "success" as const,
        },
      ],
      status: "in_progress" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    await state.writeMilestoneDiscovery("M1", milestoneDiscovery);

    // Verify project discovery has only 1 entry
    const readProjectHistory = await state.readDiscoveryHistory();
    expect(readProjectHistory?.entries).toHaveLength(1);
    expect(readProjectHistory?.entries[0].question).toBe("What is the project about?");

    // Verify milestone discovery has separate entries
    const readMilestoneDiscovery = await state.readMilestoneDiscovery("M1");
    expect(readMilestoneDiscovery?.history).toHaveLength(1);
    expect(readMilestoneDiscovery?.history[0].question).toBe("What are the success criteria for M1?");
    expect(readMilestoneDiscovery?.success_criteria).toContain("Foundation complete");
  });
});

describe("Add Feature with Discovery", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-add-feature-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await state.initialize("Test Project");
    const index = await state.readMilestoneIndex();
    index!.milestones.push({
      id: "M1",
      slug: "foundation",
      name: "Foundation",
      description: "Core infrastructure",
      order: 1,
      epics: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    await state.writeMilestoneIndex(index!);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should create new epic with discovery file", async () => {
    // Simulate adding a new epic
    await state.createEpicDir("E1", "dark-mode");

    const epic = {
      id: "E1",
      slug: "dark-mode",
      name: "Dark Mode",
      description: "User-added epic: Dark Mode",
      milestone: "M1",
      deferred: false,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      artifacts: {
        prd: { status: "pending" as const, version: 1 },
        architecture: { status: "pending" as const, version: 1 },
        stories: { status: "pending" as const, count: 0 },
      },
      dependencies: [],
      stats: { requirements: 0, stories: 0, coverage: 0 },
    };
    await state.writeEpic(epic);

    const discovery = {
      element_type: "epic" as const,
      element_id: "E1",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [],
      status: "not_started" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    await state.writeEpicDiscovery("E1", "dark-mode", discovery);

    const readEpic = await state.readEpic("E1", "dark-mode");
    const readDiscovery = await state.readEpicDiscovery("E1", "dark-mode");

    expect(readEpic).not.toBeNull();
    expect(readEpic?.name).toBe("Dark Mode");
    expect(readDiscovery).not.toBeNull();
    expect(readDiscovery?.source).toBe("user_added");
  });

  it("should add new milestone with discovery file", async () => {
    // Simulate adding a new milestone
    const index = await state.readMilestoneIndex();
    index!.milestones.push({
      id: "M2",
      slug: "mobile",
      name: "Mobile App",
      description: "User-added milestone: Mobile App",
      order: 2,
      epics: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    await state.writeMilestoneIndex(index!);

    const discovery = {
      element_type: "milestone" as const,
      element_id: "M2",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [],
      status: "not_started" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    await state.writeMilestoneDiscovery("M2", discovery);

    const readIndex = await state.readMilestoneIndex();
    const readDiscovery = await state.readMilestoneDiscovery("M2");

    expect(readIndex?.milestones).toHaveLength(2);
    expect(readIndex?.milestones[1].name).toBe("Mobile App");
    expect(readDiscovery?.source).toBe("user_added");
  });

  it("should support skipping discovery", async () => {
    await state.createEpicDir("E1", "dark-mode");

    const discovery = {
      element_type: "epic" as const,
      element_id: "E1",
      scope: [],
      out_of_scope: [],
      success_criteria: [],
      constraints: [],
      history: [],
      status: "skipped" as const,
      source: "user_added" as const,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    await state.writeEpicDiscovery("E1", "dark-mode", discovery);

    const read = await state.readEpicDiscovery("E1", "dark-mode");
    expect(read?.status).toBe("skipped");
    expect(read?.history).toHaveLength(0);
  });
});

// ============================================================================
// Engine Element Discovery Commands
// ============================================================================

import {
  createTestContext,
  cleanupTestContext,
  initializeTestProject,
  setupMilestonesApproved,
  setupEpicWithArtifacts,
  TestContext,
} from "./test-helpers.js";

describe("Engine Element Discovery Commands", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await initializeTestProject(ctx);
    await setupMilestonesApproved(ctx);
    await setupEpicWithArtifacts(ctx);
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  describe("discover.element", () => {
    it("should start epic discovery", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(result.status).toBe("success");
      expect(result.data.element).not.toBeNull();
      expect((result.data.element as any).id).toBe("E1");
      expect(result.data.discovery).not.toBeNull();
    });

    it("should start milestone discovery", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "milestone",
        elementId: "M1",
      });

      expect(result.status).toBe("success");
      expect(result.data.element).not.toBeNull();
      expect((result.data.element as any).id).toBe("M1");
      expect(result.data.discovery).not.toBeNull();
    });

    it("should return error for invalid epic", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E999",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("EPIC_NOT_FOUND");
    });

    it("should return error for invalid milestone", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "milestone",
        elementId: "M999",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("MILESTONE_NOT_FOUND");
    });

    it("should return error for malformed milestone ID", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "milestone",
        elementId: "invalid",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("INVALID_ID");
    });

    it("should provide AI guidance for discovery", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(result.aiGuidance).toBeDefined();
      expect(result.aiGuidance?.instructions.length).toBeGreaterThan(0);
    });

    it("should set discovery status to in_progress", async () => {
      const result = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(result.data.discovery?.status).toBe("in_progress");
    });
  });

  describe("discover.addElementEntry", () => {
    beforeEach(async () => {
      // Start discovery first
      await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });
    });

    it("should add entry to epic discovery", async () => {
      const result = await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E1",
        category: "problem",
        question: "What problem does this epic solve?",
        answer: "Users need authentication",
      });

      expect(result.status).toBe("success");
      expect(result.data.entry.category).toBe("problem");
      expect(result.data.entry.answer).toBe("Users need authentication");
    });

    it("should add entry to milestone discovery", async () => {
      await ctx.engine.discover.element({
        elementType: "milestone",
        elementId: "M1",
      });

      const result = await ctx.engine.discover.addElementEntry({
        elementType: "milestone",
        elementId: "M1",
        category: "vision",
        question: "What is the goal of this milestone?",
        answer: "Build foundation",
      });

      expect(result.status).toBe("success");
      expect(result.data.entry.category).toBe("vision");
    });

    it("should return error for invalid epic", async () => {
      const result = await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E999",
        category: "problem",
        question: "test",
        answer: "test",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("EPIC_NOT_FOUND");
    });

    it("should return error for invalid milestone ID format", async () => {
      const result = await ctx.engine.discover.addElementEntry({
        elementType: "milestone",
        elementId: "invalid",
        category: "problem",
        question: "test",
        answer: "test",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("INVALID_ID");
    });

    it("should update problem in discovery from entry", async () => {
      await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E1",
        category: "problem",
        question: "What's the problem?",
        answer: "Need secure login",
      });

      const readResult = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(readResult.data.discovery?.problem).toBe("Need secure login");
    });

    it("should update success criteria from entry", async () => {
      await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E1",
        category: "success",
        question: "When is this done?",
        answer: "Users can login securely",
      });

      const readResult = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(readResult.data.discovery?.success_criteria).toContain("Users can login securely");
    });

    it("should update scope from in-scope question", async () => {
      await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E1",
        category: "other",
        question: "What's in scope?",
        answer: "Login and logout",
      });

      const readResult = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(readResult.data.discovery?.scope).toContain("Login and logout");
    });

    it("should update out_of_scope from out of scope question", async () => {
      await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E1",
        category: "other",
        question: "What's out of scope?",
        answer: "Password reset",
      });

      const readResult = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(readResult.data.discovery?.out_of_scope).toContain("Password reset");
    });

    it("should add constraints from constraints question", async () => {
      await ctx.engine.discover.addElementEntry({
        elementType: "epic",
        elementId: "E1",
        category: "constraints",
        question: "Any blockers or dependencies?",
        answer: "Need database setup first",
      });

      const readResult = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });

      expect(readResult.data.discovery?.constraints.length).toBeGreaterThan(0);
      expect(readResult.data.discovery?.constraints[0].constraint).toBe("Need database setup first");
    });
  });

  describe("discover.completeElement", () => {
    beforeEach(async () => {
      // Start discovery first
      await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });
    });

    it("should mark epic discovery as complete", async () => {
      const result = await ctx.engine.discover.completeElement({
        elementType: "epic",
        elementId: "E1",
      });

      expect(result.status).toBe("success");
      expect(result.data.completed).toBe(true);

      const readResult = await ctx.engine.discover.element({
        elementType: "epic",
        elementId: "E1",
      });
      expect(readResult.data.discovery?.status).toBe("complete");
    });

    it("should mark milestone discovery as complete", async () => {
      await ctx.engine.discover.element({
        elementType: "milestone",
        elementId: "M1",
      });

      const result = await ctx.engine.discover.completeElement({
        elementType: "milestone",
        elementId: "M1",
      });

      expect(result.status).toBe("success");
      expect(result.data.completed).toBe(true);
    });

    it("should return error for epic without discovery", async () => {
      // Create a new epic without starting discovery
      await ctx.state.createEpicDir("E2", "new-epic");
      await ctx.state.writeEpic({
        id: "E2",
        slug: "new-epic",
        name: "New Epic",
        description: "No discovery started",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "pending", version: 1 },
          architecture: { status: "pending", version: 1 },
          stories: { status: "pending", count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      });

      const result = await ctx.engine.discover.completeElement({
        elementType: "epic",
        elementId: "E2",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("NO_DISCOVERY");
    });

    it("should return error for invalid epic", async () => {
      const result = await ctx.engine.discover.completeElement({
        elementType: "epic",
        elementId: "E999",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("EPIC_NOT_FOUND");
    });

    it("should return error for invalid milestone ID format", async () => {
      const result = await ctx.engine.discover.completeElement({
        elementType: "milestone",
        elementId: "badformat",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("INVALID_ID");
    });

    it("should return error for milestone without discovery", async () => {
      // M1 exists but has no discovery file (we haven't started discover.element for it)
      const result = await ctx.engine.discover.completeElement({
        elementType: "milestone",
        elementId: "M1",
      });

      expect(result.status).toBe("error");
      expect(result.errorCode).toBe("NO_DISCOVERY");
    });
  });
});

describe("Backward Compatibility", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-backward-compat-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should work with epic that has no discovery.json", async () => {
    await state.initialize("Test Project");
    await state.createEpicDir("E1", "auth");
    await state.writeEpic({
      id: "E1",
      slug: "auth",
      name: "Authentication",
      description: "User authentication",
      milestone: "M1",
      deferred: false,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      artifacts: {
        prd: { status: "pending", version: 1 },
        architecture: { status: "pending", version: 1 },
        stories: { status: "pending", count: 0 },
      },
      dependencies: [],
      stats: { requirements: 0, stories: 0, coverage: 0 },
    });

    // No discovery.json exists
    const discovery = await state.readEpicDiscovery("E1", "auth");
    expect(discovery).toBeNull();

    // Epic should still be readable
    const epic = await state.readEpic("E1", "auth");
    expect(epic).not.toBeNull();
    expect(epic?.name).toBe("Authentication");
  });

  it("should work with milestone that has no discovery.json", async () => {
    await state.initialize("Test Project");
    const index = await state.readMilestoneIndex();
    index!.milestones.push({
      id: "M1",
      slug: "foundation",
      name: "Foundation",
      description: "Core infrastructure",
      order: 1,
      epics: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    await state.writeMilestoneIndex(index!);

    // No discovery.json exists
    const discovery = await state.readMilestoneDiscovery("M1");
    expect(discovery).toBeNull();

    // Milestone should still be in index
    const readIndex = await state.readMilestoneIndex();
    expect(readIndex?.milestones).toHaveLength(1);
    expect(readIndex?.milestones[0].name).toBe("Foundation");
  });

  it("should preserve project-level discovery", async () => {
    await state.initialize("Test Project");

    // Add project-level discovery
    const context = await state.readDiscoveryContext();
    context!.problem = "Test problem";
    context!.vision = "Test vision";
    await state.writeDiscoveryContext(context!);

    const history = await state.readDiscoveryHistory();
    history!.entries.push({
      timestamp: new Date().toISOString(),
      question: "What problem?",
      answer: "Test problem",
      category: "problem",
    });
    history!.is_complete = true;
    await state.writeDiscoveryHistory(history!);

    // Verify project-level discovery still works
    const readContext = await state.readDiscoveryContext();
    const readHistory = await state.readDiscoveryHistory();

    expect(readContext?.problem).toBe("Test problem");
    expect(readHistory?.is_complete).toBe(true);
  });
});
