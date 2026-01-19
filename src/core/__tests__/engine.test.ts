import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestContext,
  cleanupTestContext,
  initializeTestProject,
  setupDiscoveryComplete,
  setupMilestonesApproved,
  setupEpicWithArtifacts,
  TestContext,
  expectSuccess,
} from "./test-helpers.js";

describe("LisaEngine", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    await initializeTestProject(ctx);
  });

  afterEach(async () => {
    await cleanupTestContext(ctx);
  });

  // ==========================================================================
  // Status Commands
  // ==========================================================================

  describe("status commands", () => {
    describe("overview", () => {
      it("should return project overview", async () => {
        const result = await ctx.engine.status.overview();
        const data = expectSuccess(result);

        expect(data.project.name).toBe("Test Project");
        expect(data.project.status).toBe("active");
      });

      it("should include stats", async () => {
        await setupDiscoveryComplete(ctx);
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);

        const result = await ctx.engine.status.overview();
        const data = expectSuccess(result);

        expect(data.project.stats.epics).toBe(1);
        expect(data.project.stats.stories).toBe(3);
        expect(data.project.stats.completedStories).toBe(1);
      });

      it("should have sections for display", async () => {
        const result = await ctx.engine.status.overview();

        // Overview doesn't include AI guidance in status commands
        expect(result.sections).toBeDefined();
        expect(result.sections.length).toBeGreaterThan(0);
      });
    });

    describe("board", () => {
      beforeEach(async () => {
        await setupDiscoveryComplete(ctx);
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should return kanban board data", async () => {
        const result = await ctx.engine.status.board();
        const data = expectSuccess(result);

        expect(data.columns).toBeDefined();
      });

      it("should group stories by status", async () => {
        const result = await ctx.engine.status.board();
        const data = expectSuccess(result);

        // Check that columns have stories
        const columns = data.columns;
        const hasStories = Object.values(columns).some((col: any) => col.length > 0);
        expect(hasStories).toBe(true);
      });
    });

    describe("story", () => {
      beforeEach(async () => {
        await setupDiscoveryComplete(ctx);
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should return story details", async () => {
        const result = await ctx.engine.status.story("E1.S1");
        const data = expectSuccess(result);

        expect(data.story.id).toBe("E1.S1");
        expect(data.story.title).toBe("Implement login API");
      });

      it("should return error for invalid story", async () => {
        const result = await ctx.engine.status.story("E99.S99");

        expect(result.status).toBe("error");
      });
    });

    describe("context", () => {
      beforeEach(async () => {
        await setupDiscoveryComplete(ctx);
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should return project context by default", async () => {
        const result = await ctx.engine.status.context({});

        expect(result.status).toBe("success");
        // Project context includes project.name
        expect((result.data as any).project?.name).toBe("Test Project");
      });

      it("should return epic context when targeted", async () => {
        const result = await ctx.engine.status.context({ target: "E1" });

        expect(result.status).toBe("success");
        // Epic context includes epic.id
        expect((result.data as any).epic?.id).toBe("E1");
      });
    });

    describe("why", () => {
      beforeEach(async () => {
        await setupDiscoveryComplete(ctx);
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should trace story lineage", async () => {
        const result = await ctx.engine.status.why("E1.S1");
        const data = result.data as any;

        expect(result.status).toBe("success");
        expect(data.story.id).toBe("E1.S1");
        expect(data.epic.id).toBe("E1");
        expect(data.milestone.id).toBe("M1");
      });
    });

    describe("how", () => {
      beforeEach(async () => {
        await setupDiscoveryComplete(ctx);
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should provide implementation guidance", async () => {
        const result = await ctx.engine.status.how("E1.S1");
        const data = result.data as any;

        expect(result.status).toBe("success");
        expect(data.story.id).toBe("E1.S1");
        expect(data.architecture).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Discovery Commands
  // ==========================================================================

  describe("discover commands", () => {
    describe("init", () => {
      it("should initialize a new project", async () => {
        // Create fresh context without initialization
        const freshCtx = await createTestContext();

        const result = await freshCtx.engine.discover.init("New Project");
        const data = expectSuccess(result);

        expect(data.project.name).toBe("New Project");

        await cleanupTestContext(freshCtx);
      });
    });

    describe("start", () => {
      it("should start discovery conversation", async () => {
        const result = await ctx.engine.discover.start({});

        expect(result.status).toBe("success");
        expect(result.aiGuidance).toBeDefined();
        expect(result.aiGuidance?.instructions?.length).toBeGreaterThan(0);
      });

      it("should respect depth option", async () => {
        const quickResult = await ctx.engine.discover.start({ depth: "quick" });
        const deepResult = await ctx.engine.discover.start({ depth: "deep" });

        // Both should succeed
        expect(quickResult.status).toBe("success");
        expect(deepResult.status).toBe("success");
      });
    });

    describe("addEntry", () => {
      it("should add a discovery entry", async () => {
        const result = await ctx.engine.discover.addEntry({
          category: "problem",
          question: "What problem are you solving?",
          answer: "Users need better planning tools",
        });

        expect(result.status).toBe("success");
      });
    });

    describe("status", () => {
      it("should show discovery status", async () => {
        const result = await ctx.engine.discover.status();
        const data = expectSuccess(result);

        expect(data.progress).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Plan Commands
  // ==========================================================================

  describe("plan commands", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
    });

    describe("milestones", () => {
      it("should show milestones", async () => {
        const result = await ctx.engine.plan.milestones();

        expect(result.status).toBe("success");
        expect(result.aiGuidance).toBeDefined();
      });

      it("should include AI guidance for next steps", async () => {
        const result = await ctx.engine.plan.milestones();

        expect(result.aiGuidance?.commands).toBeDefined();
        expect(result.aiGuidance?.commands?.length).toBeGreaterThan(0);
      });
    });

    describe("addMilestone", () => {
      it("should add a milestone", async () => {
        const result = await ctx.engine.plan.addMilestone({
          name: "MVP",
          description: "Minimum viable product",
        });
        const data = expectSuccess(result);

        expect(data.milestone.id).toBe("M1");
        expect(data.milestone.name).toBe("MVP");
      });
    });

    describe("approveMilestones", () => {
      it("should approve milestones", async () => {
        await ctx.engine.plan.addMilestone({
          name: "MVP",
          description: "Minimum viable product",
        });

        const milestones = await ctx.engine.plan.milestones();
        const data = expectSuccess(milestones);

        expect(data.milestones.length).toBe(1);
      });
    });

    describe("epics", () => {
      beforeEach(async () => {
        await setupMilestonesApproved(ctx);
      });

      it("should show epics for milestone", async () => {
        const result = await ctx.engine.plan.epics("M1");
        const data = expectSuccess(result);

        expect(data.milestoneId).toBe("M1");
      });
    });

    describe("addEpic", () => {
      beforeEach(async () => {
        await setupMilestonesApproved(ctx);
      });

      it("should add an epic", async () => {
        const result = await ctx.engine.plan.addEpic({
          milestoneId: "M1",
          name: "User Auth",
          description: "Authentication system",
        });
        const data = expectSuccess(result);

        expect(data.epic.id).toBe("E1");
        expect(data.epic.name).toBe("User Auth");
      });
    });

    describe("epic", () => {
      beforeEach(async () => {
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should show epic planning status", async () => {
        const result = await ctx.engine.plan.epic("E1");
        const data = expectSuccess(result);

        expect(data.epic.id).toBe("E1");
        expect(data.artifacts).toBeDefined();
      });

      it("should indicate next step", async () => {
        const result = await ctx.engine.plan.epic("E1");
        const data = expectSuccess(result);

        expect(data.nextStep).toBeDefined();
      });
    });

    describe("stories", () => {
      beforeEach(async () => {
        await setupMilestonesApproved(ctx);
        await setupEpicWithArtifacts(ctx);
      });

      it("should show stories for epic", async () => {
        const result = await ctx.engine.plan.stories("E1");
        const data = expectSuccess(result);

        expect(data.epicId).toBe("E1");
        expect(data.stories.length).toBe(3);
      });
    });
  });

  // ==========================================================================
  // Feedback Commands
  // ==========================================================================

  describe("feedback commands", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    describe("mark", () => {
      it("should mark story as done", async () => {
        const result = await ctx.engine.feedback.mark({
          storyId: "E1.S1",
          status: "done",
        });
        const data = expectSuccess(result);

        expect(data.newStatus).toBe("done");
      });

      it("should mark story as blocked with reason", async () => {
        const result = await ctx.engine.feedback.mark({
          storyId: "E1.S1",
          status: "blocked",
          reason: "Waiting for API",
        });
        const data = expectSuccess(result);

        expect(data.newStatus).toBe("blocked");
        expect(data.reason).toBe("Waiting for API");
      });

      it("should fail for invalid story", async () => {
        const result = await ctx.engine.feedback.mark({
          storyId: "E99.S99",
          status: "done",
        });

        expect(result.status).toBe("error");
      });
    });

    describe("add", () => {
      it("should add feedback item", async () => {
        const result = await ctx.engine.feedback.add({
          storyId: "E1.S1",
          type: "blocker",
          message: "API is down",
        });
        const data = expectSuccess(result);

        expect(data.feedback.type).toBe("blocker");
      });

      it("should auto-block story for blocker feedback", async () => {
        const result = await ctx.engine.feedback.add({
          storyId: "E1.S1",
          type: "blocker",
          message: "API is down",
        });
        const data = expectSuccess(result);

        expect(data.markedBlocked).toBe(true);
      });
    });

    describe("list", () => {
      it("should list pending feedback", async () => {
        // Add some feedback first
        await ctx.engine.feedback.add({
          storyId: "E1.S1",
          type: "question",
          message: "What should happen on error?",
        });

        const result = await ctx.engine.feedback.list();
        const data = expectSuccess(result);

        expect(data.pending.length).toBeGreaterThan(0);
      });

      it("should return empty list when no feedback", async () => {
        const result = await ctx.engine.feedback.list();
        const data = expectSuccess(result);

        expect(data.pending).toEqual([]);
      });
    });

    describe("resolve", () => {
      it("should resolve feedback item", async () => {
        // Add feedback first
        await ctx.engine.feedback.add({
          storyId: "E1.S1",
          type: "question",
          message: "What should happen?",
        });

        const listResult = await ctx.engine.feedback.list();
        const listData = expectSuccess(listResult);
        const feedbackId = listData.pending[0].id;

        const result = await ctx.engine.feedback.resolve({
          feedbackId,
          resolution: "Decided to show error message",
        });
        const data = expectSuccess(result);

        expect(data.resolved).toBe(true);
      });
    });

    describe("dismiss", () => {
      it("should dismiss feedback item", async () => {
        // Add feedback first
        await ctx.engine.feedback.add({
          storyId: "E1.S1",
          type: "question",
          message: "Not important anymore",
        });

        const listResult = await ctx.engine.feedback.list();
        const listData = expectSuccess(listResult);
        const feedbackId = listData.pending[0].id;

        const result = await ctx.engine.feedback.dismiss(feedbackId);
        const data = expectSuccess(result);

        expect(data.dismissed).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Validate Commands
  // ==========================================================================

  describe("validate commands", () => {
    beforeEach(async () => {
      await setupDiscoveryComplete(ctx);
      await setupMilestonesApproved(ctx);
      await setupEpicWithArtifacts(ctx);
    });

    describe("all", () => {
      it("should run full validation", async () => {
        const result = await ctx.engine.validate.all();
        const data = expectSuccess(result);

        expect(data.issues).toBeDefined();
        expect(data.links).toBeDefined();
        expect(data.coverage).toBeDefined();
      });

      it("should report no errors for valid project", async () => {
        const result = await ctx.engine.validate.all();
        const data = expectSuccess(result);

        expect(data.summary.errors).toBe(0);
      });
    });

    describe("links", () => {
      it("should validate links", async () => {
        const result = await ctx.engine.validate.links();
        const data = expectSuccess(result);

        expect(data.links.summary).toBeDefined();
      });

      it("should report valid links", async () => {
        const result = await ctx.engine.validate.links();
        const data = expectSuccess(result);

        expect(data.links.summary.broken).toBe(0);
      });
    });

    describe("coverage", () => {
      it("should validate coverage", async () => {
        const result = await ctx.engine.validate.coverage();
        const data = expectSuccess(result);

        expect(data.coverage.summary).toBeDefined();
      });

      it("should report 100% coverage for test data", async () => {
        const result = await ctx.engine.validate.coverage();
        const data = expectSuccess(result);

        expect(data.coverage.summary.coverage_percent).toBe(100);
      });
    });

    describe("epic", () => {
      it("should validate specific epic", async () => {
        const result = await ctx.engine.validate.epic("E1");
        const data = expectSuccess(result);

        expect(data.epicId).toBe("E1");
        expect(data.artifacts).toBeDefined();
        expect(data.coverage).toBeDefined();
      });

      it("should fail for invalid epic", async () => {
        const result = await ctx.engine.validate.epic("E99");

        expect(result.status).toBe("error");
      });
    });
  });
});
