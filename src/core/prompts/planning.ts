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
  const commands: CommandSuggestion[] = [];

  if (!index || index.milestones.length === 0) {
    commands.push({
      command: "plan add-milestone",
      args: "--name '<name>' --description '<desc>'",
      description: "Add a milestone",
      when: "To create first milestone",
    });
    commands.push({
      command: "discover",
      description: "Continue discovery",
      when: "To gather more context before planning",
    });

    return {
      situation: "No milestones yet",
      instructions: ["Ask user what they want to do"],
      commands,
      context: {
        projectProblem: context?.problem,
        projectVision: context?.vision,
      },
    };
  }

  // Show epics command for each milestone
  for (const m of index.milestones) {
    commands.push({
      command: "plan epics",
      args: m.id,
      description: `View/add epics for ${m.id}: ${m.name}`,
      when: `To plan ${m.id}`,
    });
  }

  commands.push({
    command: "plan add-milestone",
    args: "--name '<name>' --description '<desc>'",
    description: "Add another milestone",
    when: "To add new feature or phase",
  });
  commands.push({
    command: "discover",
    description: "Continue discovery",
    when: "To refine understanding",
  });
  commands.push({
    command: "status board",
    description: "View kanban board",
    when: "To work on stories",
  });

  return {
    situation: `${index.milestones.length} milestone(s) defined`,
    instructions: ["Ask user what they want to do"],
    commands,
  };
}

// ============================================================================
// Epics Guidance
// ============================================================================

export function getEpicsGuidance(
  milestone: Milestone,
  epics: Array<{ epic: Epic; status: DerivedEpicStatus }>
): AIGuidance {
  const commands: CommandSuggestion[] = [];

  if (epics.length === 0) {
    commands.push({
      command: "plan add-epic",
      args: `--milestone ${milestone.id} --name '<name>' --description '<desc>'`,
      description: "Add an epic",
      when: "To create first epic for this milestone",
    });
    commands.push({
      command: "discover element",
      args: `--element-type milestone --element-id ${milestone.id}`,
      description: "Run milestone discovery",
      when: "To gather more context about this milestone",
    });
    commands.push({
      command: "plan milestones",
      description: "View all milestones",
      when: "To switch to a different milestone",
    });

    return {
      situation: `${milestone.id}: ${milestone.name} - no epics yet`,
      instructions: ["Ask user what they want to do"],
      commands,
      context: {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        milestoneDescription: milestone.description,
      },
    };
  }

  // Show plan command for each epic
  for (const e of epics) {
    commands.push({
      command: "plan epic",
      args: e.epic.id,
      description: `Plan ${e.epic.id}: ${e.epic.name} [${e.status}]`,
      when: `To work on ${e.epic.id}`,
    });
  }

  commands.push({
    command: "plan add-epic",
    args: `--milestone ${milestone.id} --name '<name>' --description '<desc>'`,
    description: "Add another epic",
    when: "To add new epic to this milestone",
  });
  commands.push({
    command: "plan milestones",
    description: "View all milestones",
    when: "To switch milestones or add new one",
  });
  commands.push({
    command: "status board",
    description: "View kanban board",
    when: "To work on stories",
  });
  commands.push({
    command: "validate",
    description: "Run validation",
    when: "To check coverage and links",
  });

  const doneCount = epics.filter((e) => e.status === "done").length;
  return {
    situation: `${milestone.id}: ${epics.length} epic(s), ${doneCount} complete`,
    instructions: ["Ask user what they want to do"],
    commands,
  };
}

// ============================================================================
// Epic Planning Guidance
// ============================================================================

export function getEpicPlanningGuidance(
  ctx: EpicContext,
  nextStep: "prd" | "architecture" | "stories" | "complete"
): AIGuidance {
  const commands: CommandSuggestion[] = [];
  const allConstraints = [
    ...(ctx.project.constraints?.constraints || []),
    ...(ctx.milestoneDiscovery?.constraints || []),
    ...(ctx.epicDiscovery?.constraints || []),
  ];

  // Common context for all steps
  const contextData = {
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
    constraints: allConstraints,
    techStack: ctx.project.config?.stack,
  };

  if (nextStep === "prd") {
    commands.push({
      command: "plan save-prd",
      args: `--epic ${ctx.epic.id} --content '<markdown>'`,
      description: "Save PRD",
      when: "After generating PRD content",
    });
    if (!ctx.epicDiscovery || ctx.epicDiscovery.status === "not_started") {
      commands.push({
        command: "discover element",
        args: `--element-type epic --element-id ${ctx.epic.id}`,
        description: "Run epic discovery",
        when: "To gather more context before PRD",
      });
    }
    commands.push({
      command: "plan epics",
      args: ctx.milestone.id,
      description: "Back to epics list",
      when: "To switch to a different epic",
    });

    return {
      situation: `${ctx.epic.id}: needs PRD`,
      instructions: ["Ask user what they want to do"],
      commands,
      context: contextData,
    };
  }

  if (nextStep === "architecture") {
    commands.push({
      command: "plan save-architecture",
      args: `--epic ${ctx.epic.id} --content '<markdown>'`,
      description: "Save architecture",
      when: "After generating architecture",
    });
    commands.push({
      command: "plan save-prd",
      args: `--epic ${ctx.epic.id} --content '<markdown>'`,
      description: "Update PRD",
      when: "To revise requirements",
    });
    commands.push({
      command: "plan epics",
      args: ctx.milestone.id,
      description: "Back to epics list",
      when: "To switch to a different epic",
    });

    return {
      situation: `${ctx.epic.id}: PRD done, needs architecture`,
      instructions: ["Ask user what they want to do"],
      commands,
      context: contextData,
    };
  }

  if (nextStep === "stories") {
    commands.push({
      command: "plan stories",
      args: ctx.epic.id,
      description: "Generate stories",
      when: "To create stories from requirements",
    });
    commands.push({
      command: "plan save-architecture",
      args: `--epic ${ctx.epic.id} --content '<markdown>'`,
      description: "Update architecture",
      when: "To revise technical design",
    });
    commands.push({
      command: "plan epics",
      args: ctx.milestone.id,
      description: "Back to epics list",
      when: "To switch to a different epic",
    });

    return {
      situation: `${ctx.epic.id}: architecture done, ready for stories`,
      instructions: ["Ask user what they want to do"],
      commands,
      context: contextData,
    };
  }

  // Complete
  commands.push({
    command: "validate epic",
    args: ctx.epic.id,
    description: "Validate epic",
    when: "To check coverage and links",
  });
  commands.push({
    command: "status board",
    description: "View kanban board",
    when: "To work on stories",
  });
  commands.push({
    command: "plan epics",
    args: ctx.milestone.id,
    description: "Back to epics list",
    when: "To work on another epic",
  });
  commands.push({
    command: "plan milestones",
    description: "View milestones",
    when: "To add new milestone or switch",
  });

  return {
    situation: `${ctx.epic.id}: all artifacts complete`,
    instructions: ["Ask user what they want to do"],
    commands,
    context: contextData,
  };
}

// ============================================================================
// Stories Guidance
// ============================================================================

export function getStoriesGuidance(ctx: StoryContext): AIGuidance {
  const commands: CommandSuggestion[] = [
    {
      command: "plan add-story",
      args: `--epic ${ctx.epic.id} --title '<title>' --description '<desc>' --requirements 'R1,R2' --criteria 'c1,c2'`,
      description: "Add a story",
      when: "For each story to add",
    },
    {
      command: "plan save-stories",
      args: `--epic ${ctx.epic.id}`,
      description: "Save all stories at once",
      when: "If generating stories in batch",
    },
    {
      command: "plan mark-stories-complete",
      args: ctx.epic.id,
      description: "Mark stories complete",
      when: "When done adding stories",
    },
    {
      command: "plan save-architecture",
      args: `--epic ${ctx.epic.id} --content '<markdown>'`,
      description: "Update architecture",
      when: "To revise technical design",
    },
    {
      command: "plan save-prd",
      args: `--epic ${ctx.epic.id} --content '<markdown>'`,
      description: "Update PRD",
      when: "To revise requirements",
    },
    {
      command: "validate epic",
      args: ctx.epic.id,
      description: "Validate epic",
      when: "To check coverage",
    },
  ];

  return {
    situation: `${ctx.epic.id}: generating stories`,
    instructions: ["Ask user what they want to do"],
    commands,
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

// ============================================================================
// Add Epic Guidance (called after plan addEpic)
// ============================================================================

export function getAddEpicGuidance(epicId: string, milestoneId: string): AIGuidance {
  const commands: CommandSuggestion[] = [
    {
      command: "discover element",
      args: `--element-type epic --element-id ${epicId}`,
      description: "Run epic discovery",
      when: "To gather scope and constraints",
    },
    {
      command: "plan epic",
      args: epicId,
      description: "Plan epic (PRD)",
      when: "To start PRD generation",
    },
    {
      command: "plan add-epic",
      args: `--milestone ${milestoneId} --name '<name>' --description '<desc>'`,
      description: "Add another epic",
      when: "To add more epics first",
    },
    {
      command: "plan epics",
      args: milestoneId,
      description: "View all epics",
      when: "To see milestone overview",
    },
  ];

  return {
    situation: `Epic ${epicId} created`,
    instructions: ["Ask user what they want to do next"],
    commands,
  };
}
