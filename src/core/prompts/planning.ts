/**
 * Planning Prompts for Lisa Engine
 *
 * AI guidance templates for milestone, epic, and story planning.
 */

import { AIGuidance, CommandSuggestion } from "../types.js";
import {
  DiscoveryContext,
  MilestoneIndex,
  Milestone,
  Epic,
  EpicContext,
  StoryContext,
  DerivedEpicStatus,
} from "../schemas.js";

// ============================================================================
// Milestones Guidance
// ============================================================================

export function getMilestonesGuidance(
  context: DiscoveryContext | null,
  index: MilestoneIndex | null
): AIGuidance {
  if (!index || index.milestones.length === 0) {
    return {
      situation: "No milestones defined yet - ready to create milestone structure",
      instructions: [
        "Based on the discovery context, propose milestones that fit the project scope",
        "Small projects might need 2 milestones; larger ones might need 5+",
        "Each milestone should represent a meaningful, deliverable phase",
        "Experienced default: ~3 milestones (Foundation, Core Features, Polish)",
      ],
      commands: [
        {
          command: "plan addMilestone",
          args: "{ name: '<name>', description: '<desc>' }",
          description: "Add a milestone",
          when: "For each milestone in your proposal",
        },
      ],
      context: {
        projectProblem: context?.problem,
        projectVision: context?.vision,
      },
    };
  }

  return {
    situation: `${index.milestones.length} milestones defined - ready to plan epics`,
    instructions: [
      "Pick a milestone to work on (M1 recommended for new projects)",
      "Add more milestones if needed, or proceed to epic planning",
    ],
    commands: [
      {
        command: "plan showEpics",
        args: "{ milestoneId: 'M1' }",
        description: "Plan epics for M1",
        when: "To start epic planning",
      },
      {
        command: "plan addMilestone",
        args: "{ name: '<name>', description: '<desc>' }",
        description: "Add another milestone",
        when: "If more milestones are needed",
      },
    ],
  };
}

// ============================================================================
// Epics Guidance
// ============================================================================

export function getEpicsGuidance(
  milestone: Milestone,
  epics: Array<{ epic: Epic; status: DerivedEpicStatus }>
): AIGuidance {
  if (epics.length === 0) {
    return {
      situation: `Planning epics for ${milestone.id}: ${milestone.name}`,
      instructions: [
        `Propose epics for ${milestone.id} based on its scope and complexity`,
        "Focused milestones might need 2 epics; complex ones might need 5+",
        "Each epic should be a coherent, independently plannable piece of work",
        "Experienced default: ~2-3 epics per milestone",
        "Ask user to review the milestone scope and suggest epics",
      ],
      commands: [
        {
          command: "plan addEpic",
          args: `{ milestoneId: '${milestone.id}', name: '<name>', description: '<desc>' }`,
          description: "Add an epic",
          when: "For each epic you propose",
        },
      ],
      context: {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        milestoneDescription: milestone.description,
      },
    };
  }

  const incompleteEpics = epics.filter((e) => e.status !== "done");
  const nextEpic = incompleteEpics[0];

  if (nextEpic) {
    return {
      situation: `${epics.length} epics in ${milestone.id}, ${incompleteEpics.length} incomplete`,
      instructions: [
        `Continue with ${nextEpic.epic.id}: ${nextEpic.epic.name}`,
        `Status: ${nextEpic.status}`,
      ],
      commands: [
        {
          command: "plan planEpic",
          args: `{ epicId: '${nextEpic.epic.id}' }`,
          description: `Plan ${nextEpic.epic.id}`,
          when: "To continue with this epic",
        },
        {
          command: "plan addEpic",
          args: `{ milestoneId: '${milestone.id}', name: '<name>', description: '<desc>' }`,
          description: "Add another epic",
          when: "If more epics are needed",
        },
      ],
    };
  }

  return {
    situation: `All epics in ${milestone.id} complete!`,
    instructions: ["Move to the next milestone or validate the completed work"],
    commands: [],
  };
}

// ============================================================================
// Epic Planning Guidance
// ============================================================================

export function getEpicPlanningGuidance(
  ctx: EpicContext,
  nextStep: "prd" | "architecture" | "stories" | "complete"
): AIGuidance {
  if (nextStep === "prd") {
    const instructions = [
      "Generate a PRD for this epic based on discovery context",
      "The PRD should include:",
      "  - Overview section",
      "  - Requirements (E1.R1, E1.R2, etc.) with acceptance criteria",
      "  - Out of scope section",
      "  - Dependencies section",
    ];

    // Add context about epic discovery
    if (ctx.epicDiscovery && ctx.epicDiscovery.status !== "skipped") {
      instructions.push("Reference epic discovery context:");
      if (ctx.epicDiscovery.problem) {
        instructions.push(`  - Problem: ${ctx.epicDiscovery.problem.slice(0, 60)}...`);
      }
      if (ctx.epicDiscovery.scope.length > 0) {
        instructions.push(`  - Scope: ${ctx.epicDiscovery.scope.join("; ")}`);
      }
    }

    const commands: CommandSuggestion[] = [
      {
        command: "plan savePrd",
        args: `{ epicId: '${ctx.epic.id}', content: '<markdown>' }`,
        description: "Save PRD",
        when: "After generating PRD content",
      },
    ];

    // Suggest discovery if not done
    if (!ctx.epicDiscovery || ctx.epicDiscovery.status === "not_started") {
      commands.unshift({
        command: "discover element",
        args: `{ elementType: 'epic', elementId: '${ctx.epic.id}' }`,
        description: "Run epic discovery first",
        when: "To gather more context before PRD",
      });
    }

    return {
      situation: `${ctx.epic.id} ready for PRD generation`,
      instructions,
      commands,
      context: {
        epicId: ctx.epic.id,
        epicName: ctx.epic.name,
        epicDescription: ctx.epic.description,
        milestoneId: ctx.milestone.id,
        milestoneName: ctx.milestone.name,
        projectProblem: ctx.project.discovery?.problem,
        projectVision: ctx.project.discovery?.vision,
        epicDiscovery: ctx.epicDiscovery
          ? {
              problem: ctx.epicDiscovery.problem,
              scope: ctx.epicDiscovery.scope,
              outOfScope: ctx.epicDiscovery.out_of_scope,
              successCriteria: ctx.epicDiscovery.success_criteria,
            }
          : null,
        constraints: [
          ...(ctx.project.constraints?.constraints || []),
          ...(ctx.milestoneDiscovery?.constraints || []),
          ...(ctx.epicDiscovery?.constraints || []),
        ],
      },
    };
  }

  if (nextStep === "architecture") {
    const allConstraints = [
      ...(ctx.project.constraints?.constraints || []),
      ...(ctx.milestoneDiscovery?.constraints || []),
      ...(ctx.epicDiscovery?.constraints || []),
    ];

    return {
      situation: `${ctx.epic.id} PRD complete, ready for architecture`,
      instructions: [
        "Read the PRD and generate architecture",
        "Include data models, APIs, component structure",
        "Reference requirements (E1.R1 → E1.A1)",
        allConstraints.length > 0
          ? `Consider ${allConstraints.length} constraints`
          : "Check for any constraints in context",
      ],
      commands: [
        {
          command: "plan saveArchitecture",
          args: `{ epicId: '${ctx.epic.id}', content: '<markdown>' }`,
          description: "Save architecture",
          when: "After generating architecture content",
        },
      ],
      context: {
        epicId: ctx.epic.id,
        constraints: allConstraints,
        techStack: ctx.project.config?.stack,
      },
    };
  }

  if (nextStep === "stories") {
    return {
      situation: `${ctx.epic.id} architecture complete, ready for stories`,
      instructions: [
        "Generate stories that cover all requirements",
        "Each story should have clear acceptance criteria",
        "Link to requirements and architecture",
        "Stories should be implementable in 1-3 days",
      ],
      commands: [
        {
          command: "plan showStories",
          args: `{ epicId: '${ctx.epic.id}' }`,
          description: "Generate stories",
          when: "To start story generation",
        },
      ],
    };
  }

  return {
    situation: `${ctx.epic.id} all artifacts complete!`,
    instructions: ["Run validation to check coverage and links"],
    commands: [
      {
        command: "validate epic",
        args: ctx.epic.id,
        description: "Validate epic",
        when: "To check requirements coverage",
      },
    ],
  };
}

// ============================================================================
// Stories Guidance
// ============================================================================

export function getStoriesGuidance(ctx: StoryContext): AIGuidance {
  return {
    situation: `Generating stories for ${ctx.epic.id}: ${ctx.epic.name}`,
    instructions: [
      "Read the PRD and architecture",
      "Generate stories that cover all requirements",
      "Each story should:",
      "  - Have clear acceptance criteria",
      "  - Link to requirements (E1.R1, E1.R2)",
      "  - Link to architecture (E1.A1)",
      "  - Be implementable in 1-3 days",
      "Add stories one by one or save all at once",
    ],
    commands: [
      {
        command: "plan addStory",
        args: `{ epicId: '${ctx.epic.id}', title: '<title>', description: '<desc>', requirements: ['R1','R2'], criteria: ['c1','c2'] }`,
        description: "Add a story",
        when: "For each story",
      },
      {
        command: "plan saveStories",
        args: `{ epicId: '${ctx.epic.id}', stories: [...] }`,
        description: "Save all stories at once",
        when: "If you have the full list ready",
      },
      {
        command: "plan markStoriesComplete",
        args: `{ epicId: '${ctx.epic.id}' }`,
        description: "Mark stories complete",
        when: "After all stories are added",
      },
    ],
    context: {
      epicId: ctx.epic.id,
      requirements: ctx.requirements,
      successCriteria: [
        ...(ctx.project.discovery?.success_criteria || []),
        ...(ctx.milestoneDiscovery?.success_criteria || []),
        ...(ctx.epicDiscovery?.success_criteria || []),
      ],
    },
  };
}
