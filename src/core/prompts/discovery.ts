/**
 * Discovery Prompts for Lisa Engine
 *
 * This is the "prompt contract" - centralized AI guidance templates
 * that tell any AI (Claude Code skill, Claude SDK, etc.) what to do next.
 */

import { AIGuidance, CommandSuggestion } from "../types.js";
import {
  DiscoveryContext,
  DiscoveryHistory,
  Constraints,
  DiscoveryDepth,
  ElementDiscovery,
} from "../schemas.js";

// ============================================================================
// Project Discovery Guidance
// ============================================================================

export function getDiscoveryGuidance(
  context: DiscoveryContext | null,
  _history: DiscoveryHistory | null,
  constraints: Constraints | null,
  depth: DiscoveryDepth,
  gaps: string[],
  justInitialized?: boolean
): AIGuidance {
  const hasGaps = gaps.length > 0;
  const hasSomeContext = !!context?.problem || !!context?.vision;

  // Determine situation
  let situation: string;
  if (justInitialized) {
    situation = "Project initialized, starting discovery";
  } else if (!hasSomeContext) {
    situation = "Discovery starting - no context gathered yet";
  } else if (hasGaps) {
    situation = `Discovery in progress (${depth} depth) - gaps in: ${gaps.join(", ")}`;
  } else {
    situation = "Discovery has sufficient context - ready to move to planning when you are";
  }

  // Build instructions based on state
  const instructions: string[] = [];

  // Discovery conversation - understanding the project context
  if (!hasSomeContext) {
    instructions.push(
      "Start with: 'What problem are you trying to solve?' - this is PRODUCT discovery, not planning"
    );
    instructions.push(
      "Do NOT ask about features, milestones, or technical implementation - focus on the problem space, users, and desired outcomes"
    );
    instructions.push(
      `Areas to explore (${depth}): ${formatDiscoveryRoadmap(gaps, depth)}`
    );
  } else {
    instructions.push("Continue discovery naturally - run 'lisa status context' to see what's been learned");
  }

  instructions.push("Record insights with 'discover add-entry' as you learn important context");
  instructions.push("Follow the user's lead on what to explore next or when to move to planning");

  // Build commands based on state - don't show irrelevant commands for init
  const commands: CommandSuggestion[] = [];

  // Only show context review commands if there's something to review
  if (hasSomeContext) {
    commands.push(
      {
        command: "status context",
        description: "Review discovered context summary",
        when: "To see what's been learned so far",
      },
      {
        command: "discover history",
        description: "View all Q&A entries recorded",
        when: "To review the full discovery conversation",
      }
    );
  }

  // Always show add-entry for recording insights
  commands.push({
    command: "discover add-entry",
    args: "--category <cat> --question '<q>' --answer '<a>'",
    description: "Record a discovery insight",
    when: "After gathering important context",
  });

  // Only show planning commands if there's some context to plan from
  if (hasSomeContext) {
    commands.push(
      {
        command: "plan milestones",
        description: "View/create milestones",
        when: "When user wants to structure work",
      },
      {
        command: "plan add-milestone",
        args: "--name '<name>' --description '<desc>'",
        description: "Add a milestone directly",
        when: "When user has a specific milestone in mind",
      }
    );
  }

  // Depth switching always available
  commands.push(
    {
      command: "discover --deep",
      description: "Switch to deep discovery",
      when: "If user wants more thorough exploration",
    },
    {
      command: "discover --quick",
      description: "Switch to quick discovery",
      when: "If user wants to move faster",
    }
  );

  return {
    situation,
    instructions,
    commands,
    context: {
      depth,
      gaps,
      // Full discovery context so AI knows what's been learned
      discovery: context
        ? {
            problem: context.problem,
            vision: context.vision,
            values: context.values,
            successCriteria: context.success_criteria,
          }
        : null,
      constraints: constraints?.constraints || [],
    },
  };
}

// Discovery questions by category - maps category to starter question
const DISCOVERY_QUESTIONS: Record<string, string> = {
  problem: "What problem are we solving?",
  vision: "What does the ideal end state look like?",
  users: "Who are the primary users?",
  values: "What's the most important quality this solution must have?",
  constraints: "What's your current tech stack and team setup?",
  success: "How will we know if this is successful?",
  other: "What existing solutions have you looked at?",
};

function formatDiscoveryRoadmap(gaps: string[], _depth: DiscoveryDepth): string {
  if (gaps.length === 0) return "All areas covered";

  return gaps
    .map((gap) => `${gap}: "${DISCOVERY_QUESTIONS[gap] || gap}"`)
    .join("; ");
}

// ============================================================================
// Add Entry Guidance (returned after discover add-entry)
// ============================================================================

export function getAddEntryGuidance(): AIGuidance {
  return {
    situation: "Discovery entry recorded",
    instructions: [
      "Continue the conversation naturally based on what user wants",
      "You can: continue discovery, move to planning, add milestones/epics, or follow user's lead",
    ],
    commands: [
      {
        command: "discover add-entry",
        args: "--category <cat> --question '<q>' --answer '<a>'",
        description: "Record another insight",
        when: "After gathering discovery context",
      },
      {
        command: "plan milestones",
        description: "View/create milestones",
        when: "When ready to structure work",
      },
      {
        command: "plan add-milestone",
        args: "--name '<name>' --description '<desc>'",
        description: "Add milestone directly",
        when: "When user has specific milestone",
      },
    ],
  };
}

// ============================================================================
// Element Discovery Guidance (Epic/Milestone)
// ============================================================================

const EPIC_DISCOVERY_QUESTIONS = [
  { id: "problem", question: "What problem does this epic solve?", required: true },
  { id: "scope", question: "What's in scope for this epic?", required: true },
  { id: "out_of_scope", question: "What's explicitly out of scope?", required: false },
  { id: "constraints", question: "Are there any technical constraints specific to this epic?", required: false },
  { id: "success", question: "What does success look like for this epic?", required: true },
];

const MILESTONE_DISCOVERY_QUESTIONS = [
  { id: "goal", question: "What's the goal of this milestone?", required: true },
  { id: "done", question: "What does 'done' look like for this milestone?", required: true },
  { id: "dependencies", question: "Are there any dependencies or blockers for this milestone?", required: false },
];

export function getElementDiscoveryGuidance(
  elementType: "epic" | "milestone",
  elementName: string,
  discovery: ElementDiscovery
): AIGuidance {
  const questions = elementType === "epic" ? EPIC_DISCOVERY_QUESTIONS : MILESTONE_DISCOVERY_QUESTIONS;

  // Find unanswered questions
  const answeredQuestions = new Set(discovery.history.map((e) => e.question));
  const remaining = questions.filter((q) => !answeredQuestions.has(q.question));

  let situation: string;
  if (discovery.status === "complete") {
    situation = `${elementType} discovery complete for ${elementName}`;
  } else if (remaining.length === 0) {
    situation = `All questions answered for ${elementType} ${elementName}, ready to complete`;
  } else {
    situation = `${elementType} discovery in progress for ${elementName} - ${remaining.length} questions remaining`;
  }

  const instructions: string[] = [];

  if (discovery.status === "complete") {
    instructions.push("Discovery is complete. You can still add more context if needed.");
  } else {
    instructions.push("Ask the remaining questions conversationally, one at a time");
    instructions.push("Record answers using the add-entry command");

    if (remaining.length > 0) {
      instructions.push(`Start with: "${remaining[0].question}"`);
    }

    if (remaining.length === 0) {
      instructions.push("All questions answered - complete the discovery");
    }
  }

  const commands: CommandSuggestion[] = [
    {
      command: `discover add-element-entry`,
      args: `--element-type ${elementType} --element-id ${discovery.element_id} --category <cat> --question '<q>' --answer '<a>'`,
      description: "Record an answer",
      when: "After getting an answer from the user",
    },
  ];

  if (remaining.length === 0 && discovery.status !== "complete") {
    commands.push({
      command: `discover complete-element`,
      args: `--element-type ${elementType} --element-id ${discovery.element_id}`,
      description: "Mark discovery complete",
      when: "When all required questions are answered",
    });
  }

  return {
    situation,
    instructions,
    commands,
    context: {
      elementType,
      elementId: discovery.element_id,
      remainingQuestions: remaining.map((q) => ({
        id: q.id,
        question: q.question,
        required: q.required,
      })),
      gatheredContext: {
        problem: discovery.problem,
        scope: discovery.scope,
        outOfScope: discovery.out_of_scope,
        successCriteria: discovery.success_criteria,
        constraints: discovery.constraints.length,
      },
    },
  };
}

// ============================================================================
// Not Initialized Guidance (no .lisa/ directory found)
// ============================================================================

export function getNotInitializedGuidance(): AIGuidance {
  return {
    situation: "No Lisa project found in this directory",
    instructions: [
      "ONLY Ask the user for a project name and then run 'lisa discover init \"<name>\"' to initialize",
    ],
    commands: [
      {
        command: "discover init",
        args: "--name '<project name>'",
        description: "Initialize Lisa project",
        when: "After getting the project name from user",
      },
    ],
  };
}
