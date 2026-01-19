import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StateManager, createStateManager, LISA_DIR, PATHS } from "../state.js";
import { FileSystemStateAdapter } from "../../adapters/state/index.js";

describe("StateManager", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("isInitialized", () => {
    it("should return false for uninitialized project", async () => {
      const result = await state.isInitialized();
      expect(result).toBe(false);
    });

    it("should return true after initialization", async () => {
      await state.initialize("Test Project");
      const result = await state.isInitialized();
      expect(result).toBe(true);
    });
  });

  describe("initialize", () => {
    it("should create .lisa directory", async () => {
      await state.initialize("Test Project");
      const lisaDir = path.join(testDir, LISA_DIR);
      const stat = await fs.stat(lisaDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should create subdirectories", async () => {
      await state.initialize("Test Project");

      const discoveryDir = path.join(testDir, LISA_DIR, "discovery");
      const milestonesDir = path.join(testDir, LISA_DIR, "milestones");
      const epicsDir = path.join(testDir, LISA_DIR, "epics");
      const validationDir = path.join(testDir, LISA_DIR, "validation");

      expect((await fs.stat(discoveryDir)).isDirectory()).toBe(true);
      expect((await fs.stat(milestonesDir)).isDirectory()).toBe(true);
      expect((await fs.stat(epicsDir)).isDirectory()).toBe(true);
      expect((await fs.stat(validationDir)).isDirectory()).toBe(true);
    });

    it("should create project.json with correct data", async () => {
      const project = await state.initialize("Test Project");

      expect(project.name).toBe("Test Project");
      expect(project.status).toBe("active");
      expect(project.stats.milestones).toBe(0);
    });

    it("should use default name if not provided", async () => {
      const project = await state.initialize();
      expect(project.name).toBe("Untitled Project");
    });

    it("should create empty queue files", async () => {
      await state.initialize("Test");

      const taskQueue = await state.readTaskQueue();
      const stuckQueue = await state.readStuckQueue();
      const feedbackQueue = await state.readFeedbackQueue();

      expect(taskQueue?.tasks).toEqual([]);
      expect(stuckQueue?.stuck).toEqual([]);
      expect(feedbackQueue?.feedback).toEqual([]);
    });

    it("should create empty discovery files", async () => {
      await state.initialize("Test");

      const context = await state.readDiscoveryContext();
      const constraints = await state.readConstraints();
      const history = await state.readDiscoveryHistory();

      expect(context?.values).toEqual([]);
      expect(constraints?.constraints).toEqual([]);
      expect(history?.entries).toEqual([]);
      expect(history?.is_complete).toBe(false);
    });

    it("should create default config", async () => {
      await state.initialize("Test");
      const config = await state.readConfig();

      expect(config?.checkpoints).toContain("after_epic_breakdown");
    });
  });

  describe("Project CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should read project", async () => {
      const project = await state.readProject();
      expect(project?.name).toBe("Test Project");
    });

    it("should write project", async () => {
      const project = await state.readProject();
      project!.name = "Updated Name";
      await state.writeProject(project!);

      const updated = await state.readProject();
      expect(updated?.name).toBe("Updated Name");
    });

    it("should update project fields", async () => {
      const updated = await state.updateProject({ status: "paused" });
      expect(updated.status).toBe("paused");

      const read = await state.readProject();
      expect(read?.status).toBe("paused");
    });

    it("should update timestamp on write", async () => {
      const original = await state.readProject();
      const originalUpdated = original?.updated;

      await new Promise(resolve => setTimeout(resolve, 10));
      await state.updateProject({ status: "paused" });

      const updated = await state.readProject();
      expect(updated?.updated).not.toBe(originalUpdated);
    });
  });

  describe("Discovery CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should read and write discovery context", async () => {
      const context = await state.readDiscoveryContext();
      context!.problem = "Users struggle with planning";
      context!.vision = "Seamless planning experience";
      await state.writeDiscoveryContext(context!);

      const updated = await state.readDiscoveryContext();
      expect(updated?.problem).toBe("Users struggle with planning");
      expect(updated?.vision).toBe("Seamless planning experience");
    });

    it("should read and write constraints", async () => {
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
      expect(updated?.constraints[0].type).toBe("technical");
    });

    it("should read and write discovery history", async () => {
      const history = await state.readDiscoveryHistory();
      history!.entries.push({
        timestamp: new Date().toISOString(),
        question: "What problem?",
        answer: "Planning is hard",
        category: "problem",
      });
      history!.is_complete = true;
      await state.writeDiscoveryHistory(history!);

      const updated = await state.readDiscoveryHistory();
      expect(updated?.entries).toHaveLength(1);
      expect(updated?.is_complete).toBe(true);
    });

  });

  describe("Milestones CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should read and write milestone index", async () => {
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

      const updated = await state.readMilestoneIndex();
      expect(updated?.milestones).toHaveLength(1);
    });
  });

  describe("Epics CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should create epic directory", async () => {
      await state.createEpicDir("E1", "auth");

      const dirs = await state.listEpicDirs();
      expect(dirs).toContain("E1-auth");
    });

    it("should read and write epic", async () => {
      await state.createEpicDir("E1", "auth");

      const epic = {
        id: "E1",
        slug: "auth",
        name: "Authentication",
        description: "User authentication",
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

      const read = await state.readEpic("E1", "auth");
      expect(read?.name).toBe("Authentication");
    });

    it("should read and write PRD", async () => {
      await state.createEpicDir("E1", "auth");

      const prdContent = "# E1: Authentication\n\n## Requirements\n\n### R1: Login";
      await state.writePrd("E1", "auth", prdContent);

      const read = await state.readPrd("E1", "auth");
      expect(read).toContain("# E1: Authentication");
    });

    it("should read and write architecture", async () => {
      await state.createEpicDir("E1", "auth");

      const archContent = "# Architecture\n\n## Data Model";
      await state.writeArchitecture("E1", "auth", archContent);

      const read = await state.readArchitecture("E1", "auth");
      expect(read).toContain("# Architecture");
    });

    it("should read and write stories", async () => {
      await state.createEpicDir("E1", "auth");

      const stories = {
        epic_id: "E1",
        stories: [
          {
            id: "E1.S1",
            title: "Login API",
            description: "Create login endpoint",
            type: "feature" as const,
            requirements: ["E1.R1"],
                        acceptance_criteria: ["Can login"],
            dependencies: [],
            status: "todo" as const,
            assignee: null,
          },
        ],
        coverage: { "E1.R1": ["E1.S1"] },
        validation: {
          coverage_complete: false,
          all_links_valid: false,
        },
      };

      await state.writeStories("E1", "auth", stories);

      const read = await state.readStories("E1", "auth");
      expect(read?.stories).toHaveLength(1);
      expect(read?.stories[0].title).toBe("Login API");
    });

    it("should list epic directories", async () => {
      await state.createEpicDir("E1", "auth");
      await state.createEpicDir("E2", "habits");

      const dirs = await state.listEpicDirs();
      expect(dirs).toContain("E1-auth");
      expect(dirs).toContain("E2-habits");
    });
  });

  describe("Queues CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should read and write task queue", async () => {
      const queue = await state.readTaskQueue();
      queue!.tasks.push({
        id: "task-001",
        type: "generate_prd",
        target: { type: "epic", id: "E1" },
        priority: 1,
        status: "pending",
        depends_on: [],
        created: new Date().toISOString(),
        created_by: "system",
        attempts: 0,
      });
      await state.writeTaskQueue(queue!);

      const updated = await state.readTaskQueue();
      expect(updated?.tasks).toHaveLength(1);
    });

    it("should read and write stuck queue", async () => {
      const queue = await state.readStuckQueue();
      queue!.stuck.push({
        id: "stuck-001",
        task_id: "task-001",
        type: "ambiguous_requirement",
        summary: "Cannot determine target",
        attempts: [],
        created: new Date().toISOString(),
        priority: "high",
      });
      await state.writeStuckQueue(queue!);

      const updated = await state.readStuckQueue();
      expect(updated?.stuck).toHaveLength(1);
    });

    it("should read and write feedback queue", async () => {
      const queue = await state.readFeedbackQueue();
      queue!.feedback.push({
        id: "fb-001",
        type: "blocker",
        source: { type: "execution", story_id: "E1.S1" },
        summary: "API not available",
        affects: [],
        status: "pending",
        created: new Date().toISOString(),
      });
      await state.writeFeedbackQueue(queue!);

      const updated = await state.readFeedbackQueue();
      expect(updated?.feedback).toHaveLength(1);
    });
  });

  describe("Validation CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should read and write coverage", async () => {
      const coverage = {
        coverage: {
          E1: {
            "E1.R1": { stories: ["E1.S1"], status: "covered" as const },
          },
        },
        summary: { total_requirements: 1, covered: 1, gaps: 0, coverage_percent: 100 },
        gaps: [],
      };

      await state.writeCoverage(coverage);

      const read = await state.readCoverage();
      expect(read?.summary.coverage_percent).toBe(100);
    });

    it("should read and write links", async () => {
      const links = {
        links: [
          {
            from: { type: "story" as const, id: "E1.S1" },
            to: { type: "requirement" as const, id: "E1.R1" },
            type: "implements" as const,
            valid: true,
          },
        ],
        broken: [],
        orphans: [],
        summary: { total_links: 1, valid: 1, broken: 0, orphans: 0 },
      };

      await state.writeLinks(links);

      const read = await state.readLinks();
      expect(read?.links).toHaveLength(1);
    });

    it("should read and write validation issues", async () => {
      const issues = {
        issues: [
          {
            id: "issue-001",
            severity: "error" as const,
            type: "broken_link",
            location: { type: "story", id: "E1.S1" },
            message: "Broken link",
          },
        ],
        summary: { errors: 1, warnings: 0, info: 0 },
      };

      await state.writeValidationIssues(issues);

      const read = await state.readValidationIssues();
      expect(read?.issues).toHaveLength(1);
    });
  });

  describe("Lock Management", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should acquire lock successfully", async () => {
      const acquired = await state.acquireLock("worker", "task-001");
      expect(acquired).toBe(true);
    });

    it("should read lock", async () => {
      await state.acquireLock("worker", "task-001");
      const lock = await state.readLock();

      expect(lock?.holder).toBe("worker");
      expect(lock?.task).toBe("task-001");
    });

    it("should prevent acquiring lock when already held", async () => {
      await state.acquireLock("worker", "task-001");
      const secondAttempt = await state.acquireLock("user", "task-002");

      expect(secondAttempt).toBe(false);
    });

    it("should release lock", async () => {
      await state.acquireLock("worker", "task-001");
      await state.releaseLock();

      const lock = await state.readLock();
      expect(lock).toBeNull();
    });

    it("should allow acquiring after release", async () => {
      await state.acquireLock("worker", "task-001");
      await state.releaseLock();

      const acquired = await state.acquireLock("user", "task-002");
      expect(acquired).toBe(true);
    });
  });

  describe("Path Helpers", () => {
    it("should return correct path", () => {
      const p = state.getPath("test/file.json");
      expect(p).toBe(path.join(testDir, LISA_DIR, "test/file.json"));
    });

    it("should return correct epic directory", () => {
      const dir = state.getEpicDir("E1", "auth");
      expect(dir).toBe(path.join(testDir, LISA_DIR, "epics", "E1-auth"));
    });

    it("should return correct epic file path", () => {
      const p = state.getEpicPath("E1", "auth", "prd.md");
      expect(p).toBe(path.join(testDir, LISA_DIR, "epics", "E1-auth", "prd.md"));
    });
  });

  describe("Utilities", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should check file existence", async () => {
      const exists = await state.exists(PATHS.project);
      expect(exists).toBe(true);
    });

    it("should return false for non-existent file", async () => {
      const exists = await state.exists("nonexistent.json");
      expect(exists).toBe(false);
    });

    it("should list directory contents", async () => {
      const contents = await state.listDirectory(PATHS.discovery.dir);
      expect(contents).toContain("context.json");
      expect(contents).toContain("constraints.json");
      expect(contents).toContain("history.json");
    });

    it("should return empty array for non-existent directory", async () => {
      const contents = await state.listDirectory("nonexistent");
      expect(contents).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("should return null for non-existent files", async () => {
      const project = await state.readProject();
      expect(project).toBeNull();
    });

    it("should throw error on updateProject when not initialized", async () => {
      await expect(state.updateProject({ status: "active" })).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Element Discovery (Nested Discovery for Epic/Milestone)
  // ==========================================================================

  describe("Epic Discovery CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
      await state.createEpicDir("E1", "auth");
    });

    it("should return null for epic without discovery", async () => {
      const discovery = await state.readEpicDiscovery("E1", "auth");
      expect(discovery).toBeNull();
    });

    it("should write and read epic discovery", async () => {
      const discovery = {
        element_type: "epic" as const,
        element_id: "E1",
        problem: "Users need authentication",
        scope: ["Login", "Logout"],
        out_of_scope: ["OAuth"],
        success_criteria: ["Users can log in"],
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
      expect(read?.problem).toBe("Users need authentication");
      expect(read?.scope).toEqual(["Login", "Logout"]);
      expect(read?.status).toBe("in_progress");
    });

    it("should update discovery timestamps on write", async () => {
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
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      };

      await state.writeEpicDiscovery("E1", "auth", discovery);

      const read = await state.readEpicDiscovery("E1", "auth");
      expect(read?.updated).not.toBe("2024-01-01T00:00:00.000Z");
    });

    it("should store discovery in epic directory", async () => {
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

      const exists = await state.exists("epics/E1-auth/discovery.json");
      expect(exists).toBe(true);
    });
  });

  describe("Milestone Discovery CRUD", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should return null for milestone without discovery", async () => {
      const discovery = await state.readMilestoneDiscovery("M1");
      expect(discovery).toBeNull();
    });

    it("should write and read milestone discovery", async () => {
      const discovery = {
        element_type: "milestone" as const,
        element_id: "M1",
        problem: "Need core infrastructure",
        scope: [],
        out_of_scope: [],
        success_criteria: ["Foundation complete"],
        constraints: [],
        history: [],
        status: "complete" as const,
        source: "user_added" as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await state.writeMilestoneDiscovery("M1", discovery);

      const read = await state.readMilestoneDiscovery("M1");
      expect(read).not.toBeNull();
      expect(read?.element_id).toBe("M1");
      expect(read?.success_criteria).toEqual(["Foundation complete"]);
      expect(read?.status).toBe("complete");
    });

    it("should create milestone directory if not exists", async () => {
      const discovery = {
        element_type: "milestone" as const,
        element_id: "M1",
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

      await state.writeMilestoneDiscovery("M1", discovery);

      const exists = await state.exists("milestones/M1/discovery.json");
      expect(exists).toBe(true);
    });

    it("should get correct milestone directory path", () => {
      const dir = state.getMilestoneDir("M1");
      expect(dir).toBe(path.join(testDir, LISA_DIR, "milestones", "M1"));
    });
  });

  describe("Element Discovery with History", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
      await state.createEpicDir("E1", "auth");
    });

    it("should append to discovery history", async () => {
      const discovery = {
        element_type: "epic" as const,
        element_id: "E1",
        scope: [],
        out_of_scope: [],
        success_criteria: [],
        constraints: [],
        history: [
          {
            timestamp: new Date().toISOString(),
            question: "What problem does this solve?",
            answer: "Authentication",
            category: "problem" as const,
          },
        ],
        status: "in_progress" as const,
        source: "user_added" as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await state.writeEpicDiscovery("E1", "auth", discovery);

      // Read and add more history
      const read = await state.readEpicDiscovery("E1", "auth");
      read!.history.push({
        timestamp: new Date().toISOString(),
        question: "What's in scope?",
        answer: "Login and logout",
        category: "other" as const,
      });
      await state.writeEpicDiscovery("E1", "auth", read!);

      const updated = await state.readEpicDiscovery("E1", "auth");
      expect(updated?.history).toHaveLength(2);
    });
  });

  describe("deriveEpicStatus", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
      await state.createEpicDir("E1", "auth");
    });

    it("should return 'deferred' when epic is deferred", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: true,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 3 },
        },
        dependencies: [],
        stats: { requirements: 2, stories: 3, coverage: 100 },
      };

      const status = await state.deriveEpicStatus(epic, []);
      expect(status).toBe("deferred");
    });

    it("should return 'planned' when no artifacts complete", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "pending" as const, version: 0 },
          architecture: { status: "pending" as const, version: 0 },
          stories: { status: "pending" as const, count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      };

      const status = await state.deriveEpicStatus(epic, null);
      expect(status).toBe("planned");
    });

    it("should return 'drafting' when PRD complete but no stories", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "pending" as const, version: 0 },
          stories: { status: "pending" as const, count: 0 },
        },
        dependencies: [],
        stats: { requirements: 2, stories: 0, coverage: 0 },
      };

      const status = await state.deriveEpicStatus(epic, null);
      expect(status).toBe("drafting");
    });

    it("should return 'ready' when stories exist but none started", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 2 },
        },
        dependencies: [],
        stats: { requirements: 2, stories: 2, coverage: 100 },
      };

      const stories = [
        {
          id: "E1.S1",
          title: "Story 1",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R1"],
          acceptance_criteria: [],
          dependencies: [],
          status: "todo" as const,
          assignee: null,
        },
        {
          id: "E1.S2",
          title: "Story 2",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R2"],
          acceptance_criteria: [],
          dependencies: [],
          status: "todo" as const,
          assignee: null,
        },
      ];

      const status = await state.deriveEpicStatus(epic, stories);
      expect(status).toBe("ready");
    });

    it("should return 'in_progress' when any story is in progress", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 2 },
        },
        dependencies: [],
        stats: { requirements: 2, stories: 2, coverage: 100 },
      };

      const stories = [
        {
          id: "E1.S1",
          title: "Story 1",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R1"],
          acceptance_criteria: [],
          dependencies: [],
          status: "in_progress" as const,
          assignee: "dev@example.com",
        },
        {
          id: "E1.S2",
          title: "Story 2",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R2"],
          acceptance_criteria: [],
          dependencies: [],
          status: "todo" as const,
          assignee: null,
        },
      ];

      const status = await state.deriveEpicStatus(epic, stories);
      expect(status).toBe("in_progress");
    });

    it("should return 'in_progress' when any story is in review", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 2 },
        },
        dependencies: [],
        stats: { requirements: 2, stories: 2, coverage: 100 },
      };

      const stories = [
        {
          id: "E1.S1",
          title: "Story 1",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R1"],
          acceptance_criteria: [],
          dependencies: [],
          status: "review" as const,
          assignee: "dev@example.com",
        },
        {
          id: "E1.S2",
          title: "Story 2",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R2"],
          acceptance_criteria: [],
          dependencies: [],
          status: "done" as const,
          assignee: null,
        },
      ];

      const status = await state.deriveEpicStatus(epic, stories);
      expect(status).toBe("in_progress");
    });

    it("should return 'done' when all stories are done", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 2 },
        },
        dependencies: [],
        stats: { requirements: 2, stories: 2, coverage: 100 },
      };

      const stories = [
        {
          id: "E1.S1",
          title: "Story 1",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R1"],
          acceptance_criteria: [],
          dependencies: [],
          status: "done" as const,
          assignee: null,
        },
        {
          id: "E1.S2",
          title: "Story 2",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R2"],
          acceptance_criteria: [],
          dependencies: [],
          status: "done" as const,
          assignee: null,
        },
      ];

      const status = await state.deriveEpicStatus(epic, stories);
      expect(status).toBe("done");
    });
  });

  describe("deriveMilestoneStatus", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should return 'planned' when milestone has no epics", async () => {
      const milestone = {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const status = await state.deriveMilestoneStatus(milestone);
      expect(status).toBe("planned");
    });

    it("should return 'in_progress' when any epic is in progress", async () => {
      // Create two epics with different statuses
      await state.createEpicDir("E1", "auth");
      await state.createEpicDir("E2", "db");

      const epic1 = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 1 },
        },
        dependencies: [],
        stats: { requirements: 1, stories: 1, coverage: 100 },
      };
      await state.writeEpic(epic1);

      const stories1 = {
        epic_id: "E1",
        stories: [
          {
            id: "E1.S1",
            title: "Story 1",
            description: "Desc",
            type: "feature" as const,
            requirements: ["E1.R1"],
            acceptance_criteria: [],
            dependencies: [],
            status: "in_progress" as const,
            assignee: "dev@example.com",
          },
        ],
        coverage: {},
        validation: { coverage_complete: true, all_links_valid: true },
      };
      await state.writeStories("E1", "auth", stories1);

      const epic2 = {
        id: "E2",
        slug: "db",
        name: "Database",
        description: "Database epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "pending" as const, version: 0 },
          architecture: { status: "pending" as const, version: 0 },
          stories: { status: "pending" as const, count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      };
      await state.writeEpic(epic2);

      const milestone = {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: ["E1", "E2"],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const status = await state.deriveMilestoneStatus(milestone);
      expect(status).toBe("in_progress");
    });

    it("should return 'done' when all epics are done", async () => {
      await state.createEpicDir("E1", "auth");

      const epic1 = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 1 },
        },
        dependencies: [],
        stats: { requirements: 1, stories: 1, coverage: 100 },
      };
      await state.writeEpic(epic1);

      const stories1 = {
        epic_id: "E1",
        stories: [
          {
            id: "E1.S1",
            title: "Story 1",
            description: "Desc",
            type: "feature" as const,
            requirements: ["E1.R1"],
            acceptance_criteria: [],
            dependencies: [],
            status: "done" as const,
            assignee: null,
          },
        ],
        coverage: {},
        validation: { coverage_complete: true, all_links_valid: true },
      };
      await state.writeStories("E1", "auth", stories1);

      const milestone = {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: ["E1"],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const status = await state.deriveMilestoneStatus(milestone);
      expect(status).toBe("done");
    });
  });

  describe("getEpicWithStatus", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
      await state.createEpicDir("E1", "auth");
    });

    it("should return epic with derived status", async () => {
      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "pending" as const, version: 0 },
          architecture: { status: "pending" as const, version: 0 },
          stories: { status: "pending" as const, count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      };
      await state.writeEpic(epic);

      const result = await state.getEpicWithStatus("E1", "auth");

      expect(result).not.toBeNull();
      expect(result?.epic.id).toBe("E1");
      expect(result?.status).toBe("planned");
    });

    it("should return null for non-existent epic", async () => {
      const result = await state.getEpicWithStatus("E99", "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getMilestoneWithStatus", () => {
    beforeEach(async () => {
      await state.initialize("Test Project");
    });

    it("should return milestone with derived status", async () => {
      const milestone = {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = await state.getMilestoneWithStatus(milestone);

      expect(result.milestone.id).toBe("M1");
      expect(result.status).toBe("planned");
    });

    it("should derive in_progress status from epics", async () => {
      await state.createEpicDir("E1", "auth");

      const epic = {
        id: "E1",
        slug: "auth",
        name: "Auth",
        description: "Auth epic",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete" as const, version: 1 },
          architecture: { status: "complete" as const, version: 1 },
          stories: { status: "complete" as const, count: 1 },
        },
        dependencies: [],
        stats: { requirements: 1, stories: 1, coverage: 100 },
      };
      await state.writeEpic(epic);

      const stories = {
        epic_id: "E1",
        stories: [
          {
            id: "E1.S1",
            title: "Story 1",
            description: "Desc",
            type: "feature" as const,
            requirements: ["E1.R1"],
            acceptance_criteria: [],
            dependencies: [],
            status: "in_progress" as const,
            assignee: "dev@example.com",
          },
        ],
        coverage: {},
        validation: { coverage_complete: true, all_links_valid: true },
      };
      await state.writeStories("E1", "auth", stories);

      const milestone = {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: ["E1"],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const result = await state.getMilestoneWithStatus(milestone);

      expect(result.milestone.id).toBe("M1");
      expect(result.status).toBe("in_progress");
    });
  });
});
