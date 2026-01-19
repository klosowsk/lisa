/**
 * Tests for Context Package Assembly (AD-016)
 *
 * Tests the hierarchical context assembly methods:
 * - assembleProjectContext()
 * - assembleMilestoneContext()
 * - assembleEpicContext()
 * - assembleStoryContext()
 * - extractRequirementsFromPrd()
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StateManager, createStateManager, LISA_DIR } from "../state.js";
import { FileSystemStateAdapter } from "../../adapters/state/index.js";
import type {
  Project,
  DiscoveryContext,
  Constraints,
  Config,
  MilestoneIndex,
  Epic,
  ElementDiscovery,
} from "../schemas.js";

// Helper to write test data directly to files
async function writeTestFile(testDir: string, relativePath: string, data: unknown): Promise<void> {
  const fullPath = path.join(testDir, LISA_DIR, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
}

async function writeTestMarkdown(testDir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(testDir, LISA_DIR, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

// Test fixtures
function createTestProject(): Project {
  return {
    id: "proj-test-123",
    name: "Test Project",
    created: "2026-01-17T00:00:00.000Z",
    updated: "2026-01-17T00:00:00.000Z",
    status: "active",
    stats: {
      milestones: 2,
      epics: 3,
      stories: 10,
      completed_stories: 5,
    },
  };
}

function createTestDiscoveryContext(): DiscoveryContext {
  return {
    problem: "Users struggle to track their tasks effectively",
    vision: "A seamless task management experience",
    values: [
      { id: "V1", name: "Simplicity", description: "Keep it simple", priority: 1 },
      { id: "V2", name: "Speed", description: "Fast interactions", priority: 2 },
    ],
    success_criteria: ["Users complete tasks 50% faster", "90% user satisfaction"],
    gathered: "2026-01-17T00:00:00.000Z",
  };
}

function createTestConstraints(): Constraints {
  return {
    constraints: [
      { id: "C1", type: "technical", constraint: "Must use TypeScript", impact: ["development"] },
      { id: "C2", type: "resource", constraint: "2 developers available", impact: ["timeline"] },
    ],
    gathered: "2026-01-17T00:00:00.000Z",
  };
}

function createTestConfig(): Config {
  return {
    grind: { max_attempts: 5, same_issue_threshold: 2, timeout_minutes: 10 },
    checkpoints: ["after_epic_breakdown"],
    stack: { language: "TypeScript", framework: "Node.js" },
  };
}

function createTestMilestoneIndex(): MilestoneIndex {
  return {
    milestones: [
      {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: ["E1", "E2"],
        created: "2026-01-17T00:00:00.000Z",
        updated: "2026-01-17T00:00:00.000Z",
      },
      {
        id: "M2",
        slug: "features",
        name: "Features",
        description: "User features",
        order: 2,
        epics: ["E3"],
        created: "2026-01-17T00:00:00.000Z",
        updated: "2026-01-17T00:00:00.000Z",
      },
    ],
  };
}

function createTestMilestoneDiscovery(): ElementDiscovery {
  return {
    element_type: "milestone",
    element_id: "M1",
    problem: "Need solid foundation before features",
    scope: ["Database setup", "Auth system"],
    out_of_scope: ["UI components"],
    success_criteria: ["All services running", "Auth working"],
    constraints: [{ id: "MC1", type: "technical", constraint: "Use PostgreSQL", impact: ["data"] }],
    history: [],
    status: "complete",
    source: "user_added",
    created: "2026-01-17T00:00:00.000Z",
    updated: "2026-01-17T00:00:00.000Z",
  };
}

function createTestEpic(id: string = "E1", milestone: string = "M1"): Epic {
  const slugMap: Record<string, string> = { E1: "auth-system", E2: "database-setup", E3: "user-features" };
  const nameMap: Record<string, string> = { E1: "Authentication System", E2: "Database Setup", E3: "User Features" };

  return {
    id,
    slug: slugMap[id] || "test-epic",
    name: nameMap[id] || "Test Epic",
    description: `Description for ${id}`,
    milestone,
    deferred: false,
    artifacts: {
      prd: { status: "complete", version: 1, last_updated: "2026-01-17T00:00:00.000Z" },
      architecture: { status: id === "E2" ? "pending" : "complete", version: 1, last_updated: "2026-01-17T00:00:00.000Z" },
      stories: { status: "complete", count: 5 },
    },
    dependencies: id === "E1" ? ["E2"] : [],
    stats: { requirements: 3, stories: 5, coverage: 100 },
    created: "2026-01-17T00:00:00.000Z",
    updated: "2026-01-17T00:00:00.000Z",
  };
}

function createTestEpicDiscovery(): ElementDiscovery {
  return {
    element_type: "epic",
    element_id: "E1",
    problem: "Users need secure login",
    scope: ["Login", "Logout", "Password reset"],
    out_of_scope: ["OAuth providers", "MFA"],
    success_criteria: ["Secure authentication", "Password hashing"],
    constraints: [{ id: "EC1", type: "technical", constraint: "Use bcrypt for passwords", impact: ["security"] }],
    history: [],
    status: "complete",
    source: "user_added",
    created: "2026-01-17T00:00:00.000Z",
    updated: "2026-01-17T00:00:00.000Z",
  };
}

const testPrd = `# PRD: Authentication System

## Overview
User authentication for the platform.

## Requirements

### R1: User Registration
Users can create accounts with email/password.

### R2: User Login
Users can log in with credentials.

### R3: Password Reset
Users can reset forgotten passwords.

## Out of Scope
- OAuth providers
- MFA
`;

const testArchitecture = `# Architecture: Authentication System

## Components

### A1: Auth Service
Handles authentication logic.

### A2: User Repository
Database access for users.
`;

describe("Context Package Assembly", () => {
  let testDir: string;
  let state: StateManager;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-context-test-"));
    const adapter = new FileSystemStateAdapter({ root: testDir });
    state = createStateManager(adapter);
    // Create lisa directory
    await fs.mkdir(path.join(testDir, LISA_DIR), { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("assembleProjectContext", () => {
    it("should assemble project context with all fields", async () => {
      // Setup test data
      await writeTestFile(testDir, "project.json", createTestProject());
      await writeTestFile(testDir, "discovery/context.json", createTestDiscoveryContext());
      await writeTestFile(testDir, "discovery/constraints.json", createTestConstraints());
      await writeTestFile(testDir, "config.yaml", createTestConfig());

      const ctx = await state.assembleProjectContext();

      expect(ctx.project.id).toBe("proj-test-123");
      expect(ctx.project.name).toBe("Test Project");
      expect(ctx.discovery?.problem).toBe("Users struggle to track their tasks effectively");
      expect(ctx.discovery?.vision).toBe("A seamless task management experience");
      expect(ctx.discovery?.values).toHaveLength(2);
      expect(ctx.discovery?.success_criteria).toHaveLength(2);
      expect(ctx.constraints?.constraints).toHaveLength(2);
      expect(ctx.config?.stack?.language).toBe("TypeScript");
    });

    it("should return null for missing optional fields", async () => {
      // Only write required project file
      await writeTestFile(testDir, "project.json", createTestProject());

      const ctx = await state.assembleProjectContext();

      expect(ctx.project.id).toBe("proj-test-123");
      expect(ctx.discovery).toBeNull();
      expect(ctx.constraints).toBeNull();
      expect(ctx.config).toBeNull();
    });

    it("should throw if project not initialized", async () => {
      // Don't write project.json
      await expect(state.assembleProjectContext()).rejects.toThrow("Project not initialized");
    });
  });

  describe("assembleMilestoneContext", () => {
    beforeEach(async () => {
      // Setup base project files
      await writeTestFile(testDir, "project.json", createTestProject());
      await writeTestFile(testDir, "discovery/context.json", createTestDiscoveryContext());
      await writeTestFile(testDir, "discovery/constraints.json", createTestConstraints());
      await writeTestFile(testDir, "milestones/index.json", createTestMilestoneIndex());
    });

    it("should assemble milestone context with project context", async () => {
      const ctx = await state.assembleMilestoneContext("M1");

      // Check project context is included
      expect(ctx.project.project.name).toBe("Test Project");
      expect(ctx.project.discovery?.problem).toBe("Users struggle to track their tasks effectively");

      // Check milestone-specific data
      expect(ctx.milestone.id).toBe("M1");
      expect(ctx.milestone.name).toBe("Foundation");
      expect(ctx.milestone.epics).toEqual(["E1", "E2"]);
    });

    it("should include milestone discovery when available", async () => {
      await writeTestFile(testDir, "milestones/M1/discovery.json", createTestMilestoneDiscovery());

      const ctx = await state.assembleMilestoneContext("M1");

      expect(ctx.milestoneDiscovery?.problem).toBe("Need solid foundation before features");
      expect(ctx.milestoneDiscovery?.scope).toContain("Database setup");
      expect(ctx.milestoneDiscovery?.constraints).toHaveLength(1);
    });

    it("should return null for milestoneDiscovery when not present", async () => {
      const ctx = await state.assembleMilestoneContext("M1");

      expect(ctx.milestoneDiscovery).toBeNull();
    });

    it("should include sibling epics when they exist", async () => {
      // Create epic directories with epic.json files
      await writeTestFile(testDir, "epics/E1-auth-system/epic.json", createTestEpic("E1"));
      await writeTestFile(testDir, "epics/E2-database-setup/epic.json", createTestEpic("E2"));

      const ctx = await state.assembleMilestoneContext("M1");

      expect(ctx.siblingEpics).toHaveLength(2);
      expect(ctx.siblingEpics.map((e) => e.id)).toContain("E1");
      expect(ctx.siblingEpics.map((e) => e.id)).toContain("E2");
    });

    it("should throw if milestone not found", async () => {
      await expect(state.assembleMilestoneContext("M99")).rejects.toThrow("Milestone M99 not found");
    });
  });

  describe("assembleEpicContext", () => {
    beforeEach(async () => {
      // Setup full hierarchy
      await writeTestFile(testDir, "project.json", createTestProject());
      await writeTestFile(testDir, "discovery/context.json", createTestDiscoveryContext());
      await writeTestFile(testDir, "discovery/constraints.json", createTestConstraints());
      await writeTestFile(testDir, "milestones/index.json", createTestMilestoneIndex());
      await writeTestFile(testDir, "milestones/M1/discovery.json", createTestMilestoneDiscovery());
      await writeTestFile(testDir, "epics/E1-auth-system/epic.json", createTestEpic("E1"));
      await writeTestFile(testDir, "epics/E2-database-setup/epic.json", createTestEpic("E2"));
    });

    it("should assemble epic context with full hierarchy", async () => {
      const ctx = await state.assembleEpicContext("E1");

      // Check project context
      expect(ctx.project.project.name).toBe("Test Project");
      expect(ctx.project.discovery?.problem).toBe("Users struggle to track their tasks effectively");

      // Check milestone context
      expect(ctx.milestone.id).toBe("M1");
      expect(ctx.milestone.name).toBe("Foundation");
      expect(ctx.milestoneDiscovery?.problem).toBe("Need solid foundation before features");

      // Check epic-specific data
      expect(ctx.epic.id).toBe("E1");
      expect(ctx.epic.name).toBe("Authentication System");
    });

    it("should include epic discovery when available", async () => {
      await writeTestFile(testDir, "epics/E1-auth-system/discovery.json", createTestEpicDiscovery());

      const ctx = await state.assembleEpicContext("E1");

      expect(ctx.epicDiscovery?.problem).toBe("Users need secure login");
      expect(ctx.epicDiscovery?.scope).toContain("Login");
      expect(ctx.epicDiscovery?.out_of_scope).toContain("OAuth providers");
      expect(ctx.epicDiscovery?.constraints).toHaveLength(1);
    });

    it("should return null for epicDiscovery when not present", async () => {
      const ctx = await state.assembleEpicContext("E1");

      expect(ctx.epicDiscovery).toBeNull();
    });

    it("should resolve dependencies with PRD/architecture status", async () => {
      const ctx = await state.assembleEpicContext("E1");

      expect(ctx.dependencies).toHaveLength(1);
      expect(ctx.dependencies[0].id).toBe("E2");
      expect(ctx.dependencies[0].name).toBe("Database Setup");
      expect(ctx.dependencies[0].hasPrd).toBe(true);
      expect(ctx.dependencies[0].hasArchitecture).toBe(false); // E2 has pending architecture
    });

    it("should return empty dependencies array when no dependencies", async () => {
      const ctx = await state.assembleEpicContext("E2");

      expect(ctx.dependencies).toHaveLength(0);
    });

    it("should throw if epic not found", async () => {
      await expect(state.assembleEpicContext("E99")).rejects.toThrow("Epic E99 not found");
    });

    it("should throw if epic's milestone not found", async () => {
      // Create epic with non-existent milestone
      const badEpic = createTestEpic("E3");
      badEpic.milestone = "M99";
      await writeTestFile(testDir, "epics/E3-bad-epic/epic.json", badEpic);

      await expect(state.assembleEpicContext("E3")).rejects.toThrow("Milestone M99 not found");
    });
  });

  describe("assembleStoryContext", () => {
    beforeEach(async () => {
      // Setup full hierarchy with PRD and architecture
      await writeTestFile(testDir, "project.json", createTestProject());
      await writeTestFile(testDir, "discovery/context.json", createTestDiscoveryContext());
      await writeTestFile(testDir, "discovery/constraints.json", createTestConstraints());
      await writeTestFile(testDir, "milestones/index.json", createTestMilestoneIndex());
      await writeTestFile(testDir, "milestones/M1/discovery.json", createTestMilestoneDiscovery());
      await writeTestFile(testDir, "epics/E1-auth-system/epic.json", createTestEpic("E1"));
      await writeTestFile(testDir, "epics/E1-auth-system/discovery.json", createTestEpicDiscovery());
      await writeTestFile(testDir, "epics/E2-database-setup/epic.json", createTestEpic("E2"));
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", testPrd);
      await writeTestMarkdown(testDir, "epics/E1-auth-system/architecture.md", testArchitecture);
    });

    it("should assemble story context with full hierarchy and artifacts", async () => {
      const ctx = await state.assembleStoryContext("E1");

      // Check full hierarchy is present
      expect(ctx.project.project.name).toBe("Test Project");
      expect(ctx.milestone.id).toBe("M1");
      expect(ctx.milestoneDiscovery?.problem).toBe("Need solid foundation before features");
      expect(ctx.epic.id).toBe("E1");
      expect(ctx.epicDiscovery?.problem).toBe("Users need secure login");

      // Check artifacts
      expect(ctx.prd).toContain("# PRD: Authentication System");
      expect(ctx.architecture).toContain("# Architecture: Authentication System");
    });

    it("should extract requirements from PRD", async () => {
      const ctx = await state.assembleStoryContext("E1");

      expect(ctx.requirements).toHaveLength(3);
      expect(ctx.requirements[0].id).toBe("E1.R1");
      expect(ctx.requirements[0].title).toBe("User Registration");
      expect(ctx.requirements[1].id).toBe("E1.R2");
      expect(ctx.requirements[1].title).toBe("User Login");
      expect(ctx.requirements[2].id).toBe("E1.R3");
      expect(ctx.requirements[2].title).toBe("Password Reset");
    });

    it("should throw if PRD not found", async () => {
      // Remove PRD
      await fs.rm(path.join(testDir, LISA_DIR, "epics/E1-auth-system/prd.md"));

      await expect(state.assembleStoryContext("E1")).rejects.toThrow("PRD not found for E1");
    });

    it("should throw if architecture not found", async () => {
      // Remove architecture
      await fs.rm(path.join(testDir, LISA_DIR, "epics/E1-auth-system/architecture.md"));

      await expect(state.assembleStoryContext("E1")).rejects.toThrow("Architecture not found for E1");
    });
  });

  describe("extractRequirementsFromPrd", () => {
    beforeEach(async () => {
      // Setup minimal required files
      await writeTestFile(testDir, "project.json", createTestProject());
      await writeTestFile(testDir, "milestones/index.json", createTestMilestoneIndex());
      await writeTestFile(testDir, "epics/E1-auth-system/epic.json", createTestEpic("E1"));
      await writeTestFile(testDir, "epics/E2-database-setup/epic.json", createTestEpic("E2"));
      await writeTestMarkdown(testDir, "epics/E1-auth-system/architecture.md", testArchitecture);
    });

    it("should extract requirements with ### R1: format", async () => {
      const prd = `
# PRD

### R1: First Requirement
Description here.

### R2: Second Requirement
More description.
`;
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", prd);

      const ctx = await state.assembleStoryContext("E1");

      expect(ctx.requirements).toHaveLength(2);
      expect(ctx.requirements[0]).toEqual({ id: "E1.R1", title: "First Requirement" });
      expect(ctx.requirements[1]).toEqual({ id: "E1.R2", title: "Second Requirement" });
    });

    it("should extract requirements with ### E1.R1: format", async () => {
      const prd = `
# PRD

### E1.R1: First Requirement
Description here.

### E1.R2: Second Requirement
More description.
`;
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", prd);

      const ctx = await state.assembleStoryContext("E1");

      expect(ctx.requirements).toHaveLength(2);
      expect(ctx.requirements[0]).toEqual({ id: "E1.R1", title: "First Requirement" });
      expect(ctx.requirements[1]).toEqual({ id: "E1.R2", title: "Second Requirement" });
    });

    it("should return empty array when no requirements found", async () => {
      const prd = `
# PRD

## Overview
No requirements here.
`;
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", prd);

      const ctx = await state.assembleStoryContext("E1");

      expect(ctx.requirements).toHaveLength(0);
    });

    it("should handle mixed requirement formats", async () => {
      const prd = `
# PRD

### R1: Plain Format
Description.

### E1.R2: Prefixed Format
Description.

### R3: Another Plain
Description.
`;
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", prd);

      const ctx = await state.assembleStoryContext("E1");

      expect(ctx.requirements).toHaveLength(3);
      expect(ctx.requirements.map((r) => r.id)).toEqual(["E1.R1", "E1.R2", "E1.R3"]);
    });

    it("should trim whitespace from requirement titles", async () => {
      const prd = `
### R1:   Requirement With Spaces
Description.
`;
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", prd);

      const ctx = await state.assembleStoryContext("E1");

      expect(ctx.requirements[0].title).toBe("Requirement With Spaces");
    });
  });

  describe("Context hierarchy completeness", () => {
    beforeEach(async () => {
      // Setup full hierarchy
      await writeTestFile(testDir, "project.json", createTestProject());
      await writeTestFile(testDir, "discovery/context.json", createTestDiscoveryContext());
      await writeTestFile(testDir, "discovery/constraints.json", createTestConstraints());
      await writeTestFile(testDir, "config.yaml", createTestConfig());
      await writeTestFile(testDir, "milestones/index.json", createTestMilestoneIndex());
      await writeTestFile(testDir, "milestones/M1/discovery.json", createTestMilestoneDiscovery());
      await writeTestFile(testDir, "epics/E1-auth-system/epic.json", createTestEpic("E1"));
      await writeTestFile(testDir, "epics/E1-auth-system/discovery.json", createTestEpicDiscovery());
      await writeTestFile(testDir, "epics/E2-database-setup/epic.json", createTestEpic("E2"));
      await writeTestMarkdown(testDir, "epics/E1-auth-system/prd.md", testPrd);
      await writeTestMarkdown(testDir, "epics/E1-auth-system/architecture.md", testArchitecture);
    });

    it("should provide complete context chain for story generation", async () => {
      const ctx = await state.assembleStoryContext("E1");

      // Verify all levels are accessible
      // Project level
      expect(ctx.project.project.name).toBeDefined();
      expect(ctx.project.discovery?.problem).toBeDefined();
      expect(ctx.project.discovery?.vision).toBeDefined();
      expect(ctx.project.discovery?.values).toBeDefined();
      expect(ctx.project.discovery?.success_criteria).toBeDefined();
      expect(ctx.project.constraints?.constraints).toBeDefined();
      expect(ctx.project.config?.stack).toBeDefined();

      // Milestone level
      expect(ctx.milestone.id).toBeDefined();
      expect(ctx.milestone.name).toBeDefined();
      expect(ctx.milestoneDiscovery?.problem).toBeDefined();
      expect(ctx.milestoneDiscovery?.scope).toBeDefined();
      expect(ctx.milestoneDiscovery?.success_criteria).toBeDefined();
      expect(ctx.milestoneDiscovery?.constraints).toBeDefined();

      // Epic level
      expect(ctx.epic.id).toBeDefined();
      expect(ctx.epic.name).toBeDefined();
      expect(ctx.epicDiscovery?.problem).toBeDefined();
      expect(ctx.epicDiscovery?.scope).toBeDefined();
      expect(ctx.epicDiscovery?.out_of_scope).toBeDefined();
      expect(ctx.epicDiscovery?.success_criteria).toBeDefined();
      expect(ctx.epicDiscovery?.constraints).toBeDefined();

      // Artifacts
      expect(ctx.prd).toBeDefined();
      expect(ctx.architecture).toBeDefined();
      expect(ctx.requirements).toBeDefined();
    });

    it("should aggregate all constraints across layers", async () => {
      const ctx = await state.assembleStoryContext("E1");

      // Collect all constraints from all layers
      const projectConstraints = ctx.project.constraints?.constraints || [];
      const milestoneConstraints = ctx.milestoneDiscovery?.constraints || [];
      const epicConstraints = ctx.epicDiscovery?.constraints || [];

      const allConstraints = [...projectConstraints, ...milestoneConstraints, ...epicConstraints];

      // Should have constraints from all three levels
      expect(allConstraints.length).toBeGreaterThanOrEqual(3);
      expect(allConstraints.some((c) => c.id === "C1")).toBe(true); // Project
      expect(allConstraints.some((c) => c.id === "MC1")).toBe(true); // Milestone
      expect(allConstraints.some((c) => c.id === "EC1")).toBe(true); // Epic
    });

    it("should aggregate all success criteria across layers", async () => {
      const ctx = await state.assembleStoryContext("E1");

      const projectCriteria = ctx.project.discovery?.success_criteria || [];
      const milestoneCriteria = ctx.milestoneDiscovery?.success_criteria || [];
      const epicCriteria = ctx.epicDiscovery?.success_criteria || [];

      const allCriteria = [...projectCriteria, ...milestoneCriteria, ...epicCriteria];

      // Should have criteria from all three levels
      expect(allCriteria.length).toBeGreaterThanOrEqual(4);
      expect(allCriteria).toContain("Users complete tasks 50% faster"); // Project
      expect(allCriteria).toContain("All services running"); // Milestone
      expect(allCriteria).toContain("Secure authentication"); // Epic
    });
  });
});
