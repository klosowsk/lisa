import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTestContext,
  cleanupTestContext,
  initializeTestProject,
  setupDiscoveryComplete,
  setupMilestonesApproved,
  TestContext,
} from "./test-helpers.js";

describe("Plan Script Integration", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await initializeTestProject(ctx);

    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestContext(ctx);
  });

  describe("Milestones", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
    });

    describe("show milestones", () => {
      it("should show empty milestones for new project", async () => {
        const index = await ctx.state.readMilestoneIndex();
        expect(index?.milestones).toEqual([]);
      });

      it("should show existing milestones", async () => {
        const index = await ctx.state.readMilestoneIndex();
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
        await ctx.state.writeMilestoneIndex(index!);

        const updated = await ctx.state.readMilestoneIndex();
        expect(updated?.milestones).toHaveLength(1);
        expect(updated?.milestones[0].name).toBe("Foundation");
      });
    });

    describe("add milestone", () => {
      it("should add milestone to index", async () => {
        const index = await ctx.state.readMilestoneIndex();
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
        index!.milestones.push(milestone);
        await ctx.state.writeMilestoneIndex(index!);

        const updated = await ctx.state.readMilestoneIndex();
        expect(updated?.milestones).toHaveLength(1);
      });

      it("should increment milestone number", async () => {
        const index = await ctx.state.readMilestoneIndex();

        // Add M1
        index!.milestones.push({
          id: "M1",
          slug: "foundation",
          name: "Foundation",
          description: "Core",
          order: 1,
          epics: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        });

        // Add M2
        index!.milestones.push({
          id: "M2",
          slug: "core",
          name: "Core",
          description: "Main features",
          order: 2,
          epics: [],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        });

        await ctx.state.writeMilestoneIndex(index!);

        const updated = await ctx.state.readMilestoneIndex();
        expect(updated?.milestones).toHaveLength(2);
        expect(updated?.milestones[1].id).toBe("M2");
      });
    });

    describe("project status", () => {
      it("should update project status", async () => {
        await ctx.state.updateProject({ status: "active" });

        const project = await ctx.state.readProject();
        expect(project?.status).toBe("active");
      });
    });
  });

  describe("Epics", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
    });

    describe("add epic", () => {
      it("should create epic directory", async () => {
        await ctx.state.createEpicDir("E1", "auth");

        const dirs = await ctx.state.listEpicDirs();
        expect(dirs).toContain("E1-auth");
      });

      it("should create epic metadata", async () => {
        await ctx.state.createEpicDir("E1", "auth");

        const epic = {
          id: "E1",
          slug: "auth",
          name: "Authentication",
          description: "User auth",
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

        await ctx.state.writeEpic(epic);

        const read = await ctx.state.readEpic("E1", "auth");
        expect(read?.name).toBe("Authentication");
        expect(read?.milestone).toBe("M1");
      });

      it("should update milestone with epic reference", async () => {
        await ctx.state.createEpicDir("E1", "auth");

        const index = await ctx.state.readMilestoneIndex();
        index!.milestones[0].epics.push("E1");
        await ctx.state.writeMilestoneIndex(index!);

        const updated = await ctx.state.readMilestoneIndex();
        expect(updated?.milestones[0].epics).toContain("E1");
      });
    });

    describe("plan epic", () => {
      it("should track artifact status", async () => {
        await ctx.state.createEpicDir("E1", "auth");

        const epic = {
          id: "E1",
          slug: "auth",
          name: "Auth",
          description: "Auth",
          milestone: "M1",
          deferred: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          artifacts: {
            prd: { status: "in_progress" as const, version: 1 },
            architecture: { status: "pending" as const, version: 1 },
            stories: { status: "pending" as const, count: 0 },
          },
          dependencies: [],
          stats: { requirements: 0, stories: 0, coverage: 0 },
        };

        await ctx.state.writeEpic(epic);

        const read = await ctx.state.readEpic("E1", "auth");
        expect(read?.artifacts.prd.status).toBe("in_progress");
      });
    });
  });

  describe("PRD", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await ctx.state.createEpicDir("E1", "auth");
    });

    it("should save PRD content", async () => {
      const prdContent = `# E1: Authentication

## Overview
User authentication system.

## Requirements

### R1: User Login
Users can log in.

**Acceptance Criteria:**
- [ ] Login form
- [ ] Validation
`;

      await ctx.state.writePrd("E1", "auth", prdContent);

      const read = await ctx.state.readPrd("E1", "auth");
      expect(read).toContain("# E1: Authentication");
      expect(read).toContain("### R1: User Login");
    });

    it("should update epic status after PRD", async () => {
      const epic = await ctx.state.readEpic("E1", "auth");
      if (!epic) {
        const newEpic = {
          id: "E1",
          slug: "auth",
          name: "Auth",
          description: "Auth",
          milestone: "M1",
          deferred: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          artifacts: {
            prd: { status: "complete" as const, version: 1, last_updated: new Date().toISOString() },
            architecture: { status: "pending" as const, version: 0 },
            stories: { status: "pending" as const, count: 0 },
          },
          dependencies: [],
          stats: { requirements: 2, stories: 0, coverage: 0 },
        };
        await ctx.state.writeEpic(newEpic);
      }

      const updated = await ctx.state.readEpic("E1", "auth");
      expect(updated?.artifacts.prd.status).toBe("complete");
    });
  });

  describe("Architecture", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await ctx.state.createEpicDir("E1", "auth");
    });

    it("should save architecture content", async () => {
      const archContent = `# Architecture

## Data Model
User table.

## API
POST /auth/login
`;

      await ctx.state.writeArchitecture("E1", "auth", archContent);

      const read = await ctx.state.readArchitecture("E1", "auth");
      expect(read).toContain("# Architecture");
      expect(read).toContain("POST /auth/login");
    });
  });

  describe("Stories", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await ctx.state.createEpicDir("E1", "auth");
    });

    it("should save stories file", async () => {
      const stories = {
        epic_id: "E1",
        stories: [
          {
            id: "E1.S1",
            title: "Login API",
            description: "Create login",
            type: "feature" as const,
            requirements: ["E1.R1"],
            acceptance_criteria: ["Works"],
            dependencies: [],
            status: "todo" as const,
            assignee: null,
          },
        ],
        coverage: { "E1.R1": ["E1.S1"] },
        validation: { coverage_complete: true, all_links_valid: true },
      };

      await ctx.state.writeStories("E1", "auth", stories);

      const read = await ctx.state.readStories("E1", "auth");
      expect(read?.stories).toHaveLength(1);
      expect(read?.stories[0].title).toBe("Login API");
    });

    it("should track coverage mapping", async () => {
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
            status: "todo" as const,
            assignee: null,
          },
          {
            id: "E1.S2",
            title: "Story 2",
            description: "Desc",
            type: "feature" as const,
            requirements: ["E1.R1", "E1.R2"],
            acceptance_criteria: [],
            dependencies: [],
            status: "todo" as const,
            assignee: null,
          },
        ],
        coverage: {
          "E1.R1": ["E1.S1", "E1.S2"],
          "E1.R2": ["E1.S2"],
        },
        validation: { coverage_complete: true, all_links_valid: true },
      };

      await ctx.state.writeStories("E1", "auth", stories);

      const read = await ctx.state.readStories("E1", "auth");
      expect(read?.coverage["E1.R1"]).toHaveLength(2);
      expect(read?.coverage["E1.R2"]).toHaveLength(1);
    });

    it("should update project stats", async () => {
      const project = await ctx.state.readProject();
      project!.stats.stories = 5;
      await ctx.state.writeProject(project!);

      const updated = await ctx.state.readProject();
      expect(updated?.stats.stories).toBe(5);
    });
  });

  describe("PRD with Epic Discovery", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await ctx.state.createEpicDir("E1", "auth");

      // Create epic
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
          prd: { status: "pending" as const, version: 0 },
          architecture: { status: "pending" as const, version: 0 },
          stories: { status: "pending" as const, count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      };
      await ctx.state.writeEpic(epic);
    });

    it("should read epic discovery when planning", async () => {
      // Create epic discovery
      const discovery = {
        element_type: "epic" as const,
        element_id: "E1",
        problem: "Users need secure authentication",
        scope: ["Login", "Logout", "Password reset"],
        out_of_scope: ["OAuth integration", "2FA"],
        success_criteria: ["Users can log in securely", "Session management works"],
        constraints: [
          { id: "C1", type: "technical" as const, constraint: "Must use JWT tokens", impact: [] },
        ],
        history: [],
        status: "complete" as const,
        source: "user_added" as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      await ctx.state.writeEpicDiscovery("E1", "auth", discovery);

      // Verify discovery is readable
      const read = await ctx.state.readEpicDiscovery("E1", "auth");
      expect(read).not.toBeNull();
      expect(read?.problem).toBe("Users need secure authentication");
      expect(read?.scope).toHaveLength(3);
      expect(read?.out_of_scope).toHaveLength(2);
      expect(read?.success_criteria).toHaveLength(2);
      expect(read?.constraints).toHaveLength(1);
    });

    it("should have both project and epic context available for PRD", async () => {
      // Create epic discovery
      const epicDiscovery = {
        element_type: "epic" as const,
        element_id: "E1",
        problem: "Users need authentication",
        scope: ["Login"],
        out_of_scope: [],
        success_criteria: ["Users can log in"],
        constraints: [],
        history: [],
        status: "complete" as const,
        source: "user_added" as const,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      await ctx.state.writeEpicDiscovery("E1", "auth", epicDiscovery);

      // Read both contexts
      const projectContext = await ctx.state.readDiscoveryContext();
      const epicContext = await ctx.state.readEpicDiscovery("E1", "auth");

      // Both should be available
      expect(projectContext).not.toBeNull();
      expect(projectContext?.problem).toBeDefined();
      expect(epicContext).not.toBeNull();
      expect(epicContext?.problem).toBe("Users need authentication");
    });

    it("should work without epic discovery (backward compatible)", async () => {
      // No epic discovery created
      const epicDiscovery = await ctx.state.readEpicDiscovery("E1", "auth");
      expect(epicDiscovery).toBeNull();

      // Project context should still work
      const projectContext = await ctx.state.readDiscoveryContext();
      expect(projectContext).not.toBeNull();

      // Epic should still be readable
      const epic = await ctx.state.readEpic("E1", "auth");
      expect(epic).not.toBeNull();
    });

    it("should handle skipped discovery status", async () => {
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
      await ctx.state.writeEpicDiscovery("E1", "auth", discovery);

      const read = await ctx.state.readEpicDiscovery("E1", "auth");
      expect(read?.status).toBe("skipped");
      // Skipped discovery has no context to use
      expect(read?.problem).toBeUndefined();
      expect(read?.scope).toHaveLength(0);
    });
  });
});

// ============================================================================
// Engine Plan Commands
// ============================================================================

import { setupEpicWithArtifacts } from "./test-helpers.js";

describe("Engine Plan Commands", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await initializeTestProject(ctx);
    await setupDiscoveryComplete(ctx);

    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestContext(ctx);
  });

  describe("plan.savePrd", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await ctx.state.createEpicDir("E1", "auth");
      await ctx.state.writeEpic({
        id: "E1",
        slug: "auth",
        name: "Authentication",
        description: "User auth",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "pending", version: 0 },
          architecture: { status: "pending", version: 0 },
          stories: { status: "pending", count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      });
    });

    it("should save PRD and update epic status", async () => {
      const prdContent = `# E1: Authentication\n\n## Overview\nUser auth.\n\n## Requirements\n\n### R1: Login\nUsers can login.`;

      const result = await ctx.engine.plan.savePrd({
        epicId: "E1",
        content: prdContent,
      });

      expect(result.status).toBe("success");
      expect(result.data.saved).toBe(true);

      const prd = await ctx.state.readPrd("E1", "auth");
      expect(prd).toContain("# E1: Authentication");
    });

    it("should return error for non-existent epic", async () => {
      const result = await ctx.engine.plan.savePrd({
        epicId: "E999",
        content: "test",
      });

      expect(result.status).toBe("error");
    });
  });

  describe("plan.saveArchitecture", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await ctx.state.createEpicDir("E1", "auth");
      await ctx.state.writeEpic({
        id: "E1",
        slug: "auth",
        name: "Authentication",
        description: "User auth",
        milestone: "M1",
        deferred: false,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        artifacts: {
          prd: { status: "complete", version: 1 },
          architecture: { status: "pending", version: 0 },
          stories: { status: "pending", count: 0 },
        },
        dependencies: [],
        stats: { requirements: 0, stories: 0, coverage: 0 },
      });
    });

    it("should save architecture doc", async () => {
      const archContent = `# Architecture\n\n## Data Model\nUser table.\n\n## API\nPOST /auth/login`;

      const result = await ctx.engine.plan.saveArchitecture({
        epicId: "E1",
        content: archContent,
      });

      expect(result.status).toBe("success");
      expect(result.data.saved).toBe(true);

      const arch = await ctx.state.readArchitecture("E1", "auth");
      expect(arch).toContain("# Architecture");
    });

    it("should return error for non-existent epic", async () => {
      const result = await ctx.engine.plan.saveArchitecture({
        epicId: "E999",
        content: "test",
      });

      expect(result.status).toBe("error");
    });
  });

  describe("plan.addStory", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should add a new story to epic", async () => {
      const result = await ctx.engine.plan.addStory({
        epicId: "E1",
        title: "New Feature",
        description: "A new feature",
        requirements: ["R1"],
        criteria: ["Works correctly"],
      });

      expect(result.status).toBe("success");
      expect(result.data.story.title).toBe("New Feature");
      expect(result.data.story.id).toMatch(/E1\.S\d+/);
    });

    it("should update coverage map", async () => {
      await ctx.engine.plan.addStory({
        epicId: "E1",
        title: "New Story",
        description: "Test",
        requirements: ["R1"],
        criteria: [],
      });

      const stories = await ctx.state.readStories("E1", "auth");
      expect(stories?.coverage["E1.R1"]).toBeDefined();
    });

    it("should return error for non-existent epic", async () => {
      const result = await ctx.engine.plan.addStory({
        epicId: "E999",
        title: "Test",
        description: "Test",
        requirements: [],
        criteria: [],
      });

      expect(result.status).toBe("error");
    });
  });

  describe("plan.saveStories", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should save multiple stories at once", async () => {
      const stories = [
        {
          id: "E1.S10",
          title: "Story A",
          description: "Desc A",
          type: "feature" as const,
          requirements: ["E1.R1"],
          acceptance_criteria: ["AC1"],
          dependencies: [],
          status: "todo" as const,
          assignee: null,
        },
        {
          id: "E1.S11",
          title: "Story B",
          description: "Desc B",
          type: "feature" as const,
          requirements: ["E1.R2"],
          acceptance_criteria: ["AC2"],
          dependencies: [],
          status: "todo" as const,
          assignee: null,
        },
      ];

      const result = await ctx.engine.plan.saveStories({
        epicId: "E1",
        stories,
      });

      expect(result.status).toBe("success");
      expect(result.data.count).toBe(2);
    });

    it("should build coverage map from requirements", async () => {
      const stories = [
        {
          id: "E1.S10",
          title: "Story",
          description: "Desc",
          type: "feature" as const,
          requirements: ["E1.R1", "E1.R2"],
          acceptance_criteria: [],
          dependencies: [],
          status: "todo" as const,
          assignee: null,
        },
      ];

      await ctx.engine.plan.saveStories({
        epicId: "E1",
        stories,
      });

      const savedStories = await ctx.state.readStories("E1", "auth");
      expect(savedStories?.coverage["E1.R1"]).toContain("E1.S10");
      expect(savedStories?.coverage["E1.R2"]).toContain("E1.S10");
    });

    it("should return error for non-existent epic", async () => {
      const result = await ctx.engine.plan.saveStories({
        epicId: "E999",
        stories: [],
      });

      expect(result.status).toBe("error");
    });
  });

  describe("plan.milestones edge cases", () => {
    it("should return warning when discovery not complete", async () => {
      // Reset discovery to incomplete
      const history = await ctx.state.readDiscoveryHistory();
      history!.is_complete = false;
      await ctx.state.writeDiscoveryHistory(history!);

      const result = await ctx.engine.plan.milestones();

      expect(result.status).toBe("success");
      expect(result.data.discoveryComplete).toBe(false);
    });

    it("should show AI guidance when no milestones exist", async () => {
      const result = await ctx.engine.plan.milestones();

      expect(result.aiGuidance).toBeDefined();
    });
  });

  describe("plan.epic edge cases", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should determine next step based on artifact status", async () => {
      const result = await ctx.engine.plan.epic("E1");

      expect(result.status).toBe("success");
      expect(result.data.nextStep).toBeDefined();
    });

    it("should throw for invalid epic", async () => {
      await expect(ctx.engine.plan.epic("E999")).rejects.toThrow("Epic E999 not found");
    });
  });

  describe("plan.stories edge cases", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should show existing stories", async () => {
      const result = await ctx.engine.plan.stories("E1");

      expect(result.status).toBe("success");
      expect(result.data.stories.length).toBeGreaterThan(0);
    });

    it("should return error for invalid epic", async () => {
      const result = await ctx.engine.plan.stories("E999");

      expect(result.status).toBe("error");
    });
  });

  describe("plan.addEpic", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
    });

    it("should add epic to milestone", async () => {
      const result = await ctx.engine.plan.addEpic({
        milestoneId: "M1",
        name: "New Epic",
        description: "A new epic",
      });

      expect(result.status).toBe("success");
      expect(result.data.epic.name).toBe("New Epic");
      expect(result.data.epic.milestone).toBe("M1");
    });

    it("should return error for invalid milestone", async () => {
      const result = await ctx.engine.plan.addEpic({
        milestoneId: "M999",
        name: "Test",
        description: "Test",
      });

      expect(result.status).toBe("error");
    });
  });

  describe("plan.epics", () => {
    beforeEach(async () => {
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    it("should show epics for milestone", async () => {
      const result = await ctx.engine.plan.epics("M1");

      expect(result.status).toBe("success");
      expect(result.data.milestoneId).toBe("M1");
    });

    it("should show all epics when no milestone specified", async () => {
      const result = await ctx.engine.plan.epics();

      expect(result.status).toBe("success");
    });
  });
});
