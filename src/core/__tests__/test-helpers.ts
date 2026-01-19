import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { StateManager, createStateManager } from "../state.js";
import { FileSystemStateAdapter } from "../../adapters/state/index.js";
import { createEngine, LisaEngine } from "../engine.js";
import { CommandResult } from "../types.js";

export interface TestContext {
  testDir: string;
  state: StateManager;
  engine: LisaEngine;
}

/**
 * Assert that a command result is successful and return the data with proper typing.
 * Throws an error if the result is not successful.
 * Uses NonNullable to ensure TypeScript knows the data is not null.
 */
export function expectSuccess<T>(result: CommandResult<T>): NonNullable<T> {
  if (result.status !== "success") {
    throw new Error(`Expected success but got ${result.status}: ${result.error || "unknown error"}`);
  }
  // When status is "success", data is guaranteed to be T (not null)
  return result.data as NonNullable<T>;
}

/**
 * Assert that a command result is an error and return the error details.
 * Throws if the result is not an error.
 */
export function expectError(result: CommandResult<unknown>): { error: string; errorCode: string } {
  if (result.status !== "error") {
    throw new Error(`Expected error but got ${result.status}`);
  }
  return { error: result.error, errorCode: result.errorCode };
}

export async function createTestContext(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "lisa-core-test-"));
  const adapter = new FileSystemStateAdapter({ root: testDir });
  const state = createStateManager(adapter);
  const engine = createEngine({ rootDir: testDir });

  return { testDir, state, engine };
}

export async function cleanupTestContext(ctx: TestContext): Promise<void> {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
}

export async function initializeTestProject(ctx: TestContext, name = "Test Project") {
  return ctx.state.initialize(name);
}

export async function setupDiscoveryComplete(ctx: TestContext) {
  const context = await ctx.state.readDiscoveryContext();
  if (context) {
    context.problem = "Test problem";
    context.vision = "Test vision";
    context.values = [
      { id: "V1", name: "Simplicity", description: "Keep it simple", priority: 1 },
    ];
    context.success_criteria = ["Success metric"];
    context.gathered = new Date().toISOString();
    await ctx.state.writeDiscoveryContext(context);
  }

  const history = await ctx.state.readDiscoveryHistory();
  if (history) {
    history.entries = [
      {
        timestamp: new Date().toISOString(),
        question: "What problem?",
        answer: "Test problem",
        category: "problem",
      },
    ];
    await ctx.state.writeDiscoveryHistory(history);
  }
}

export async function setupMilestonesApproved(ctx: TestContext) {
  const index = await ctx.state.readMilestoneIndex();
  if (index) {
    index.milestones = [
      {
        id: "M1",
        slug: "foundation",
        name: "Foundation",
        description: "Core infrastructure",
        order: 1,
        epics: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ];
    await ctx.state.writeMilestoneIndex(index);
  }

  // Update project stats
  const project = await ctx.state.readProject();
  if (project) {
    project.stats.milestones = 1;
    await ctx.state.writeProject(project);
  }
}

export async function setupEpicWithArtifacts(ctx: TestContext, epicId = "E1") {
  await ctx.state.createEpicDir(epicId, "auth");

  const epic = {
    id: epicId,
    slug: "auth",
    name: "Authentication",
    description: "User authentication system",
    milestone: "M1",
    deferred: false,
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

  await ctx.state.writeEpic(epic);

  const prd = `# ${epicId}: Authentication

## Overview
User authentication system.

## Requirements

### R1: User Login
Users can log in with email and password.

**Acceptance Criteria:**
- [ ] Login form displayed
- [ ] Successful login redirects

### R2: User Logout
Users can log out.

**Acceptance Criteria:**
- [ ] Logout button visible
- [ ] Session cleared on logout
`;

  await ctx.state.writePrd(epicId, "auth", prd);

  const arch = `# Architecture

## Data Model
User table with auth fields.

## API
POST /auth/login
POST /auth/logout
`;

  await ctx.state.writeArchitecture(epicId, "auth", arch);

  const stories = {
    epic_id: epicId,
    stories: [
      {
        id: `${epicId}.S1`,
        title: "Implement login API",
        description: "Create login endpoint",
        type: "feature" as const,
        requirements: [`${epicId}.R1`],
        acceptance_criteria: ["API returns token"],
        dependencies: [],
        status: "todo" as const,
        assignee: null,
      },
      {
        id: `${epicId}.S2`,
        title: "Implement login UI",
        description: "Create login form",
        type: "feature" as const,
        requirements: [`${epicId}.R1`],
        acceptance_criteria: ["Form submits"],
        dependencies: [`${epicId}.S1`],
        status: "in_progress" as const,
        assignee: "dev@example.com",
      },
      {
        id: `${epicId}.S3`,
        title: "Implement logout",
        description: "Create logout functionality",
        type: "feature" as const,
        requirements: [`${epicId}.R2`],
        acceptance_criteria: ["Session cleared"],
        dependencies: [],
        status: "done" as const,
        assignee: null,
      },
    ],
    coverage: {
      [`${epicId}.R1`]: [`${epicId}.S1`, `${epicId}.S2`],
      [`${epicId}.R2`]: [`${epicId}.S3`],
    },
    validation: {
      coverage_complete: true,
      all_links_valid: true,
    },
  };

  await ctx.state.writeStories(epicId, "auth", stories);

  // Update milestone with epic
  const index = await ctx.state.readMilestoneIndex();
  if (index && index.milestones.length > 0) {
    index.milestones[0].epics.push(epicId);
    await ctx.state.writeMilestoneIndex(index);
  }

  // Update project stats
  const project = await ctx.state.readProject();
  if (project) {
    project.stats.epics = 1;
    project.stats.stories = 3;
    project.stats.completed_stories = 1;
    await ctx.state.writeProject(project);
  }
}
