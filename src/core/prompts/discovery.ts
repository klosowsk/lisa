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
  history: DiscoveryHistory | null,
  _constraints: Constraints | null,
  depth: DiscoveryDepth,
  gaps: string[]
): AIGuidance {
  const isComplete = history?.is_complete || false;
  const hasGaps = gaps.length > 0;
  const hasSomeContext = !!context?.problem || !!context?.vision;

  // Determine situation
  let situation: string;
  if (isComplete) {
    situation = "Discovery complete, can continue anytime to add more context";
  } else if (!hasSomeContext) {
    situation = "Discovery starting - no context gathered yet";
  } else if (hasGaps) {
    situation = `Discovery in progress (${depth} depth) - gaps in: ${gaps.join(", ")}`;
  } else {
    situation = "Discovery in progress - sufficient context for current depth, consider completing";
  }

  // Build instructions based on state
  const instructions: string[] = [];

  // Discovery conversation
  if (!hasSomeContext) {
    instructions.push("Start a natural conversation to understand the project");
    instructions.push(`Ask about: "${getStarterQuestion(gaps[0] || 'problem')}"`);
  } else {
    instructions.push("Continue the discovery conversation naturally");
  }

  instructions.push("Ask follow-up questions based on user's answers");
  instructions.push("For short answers on important topics, probe deeper");
  instructions.push("For detailed answers, acknowledge and move on");

  if (gaps.includes("other")) {
    instructions.push("For research/benchmarks: use web search to find competitors and best practices");
  }

  instructions.push("Record key insights as you go");

  if (!hasGaps && !isComplete) {
    instructions.push("Sufficient context gathered for this depth - suggest completing discovery");
  }

  // Build commands
  const commands: CommandSuggestion[] = [
    {
      command: "discover add-entry",
      args: "--category <cat> --question '<q>' --answer '<a>'",
      description: "Record a discovery insight",
      when: "After gathering important context",
    },
  ];

  if (!hasGaps || isComplete) {
    commands.push({
      command: "discover complete",
      description: "Mark discovery as complete checkpoint",
      when: "When sufficient context gathered",
    });
  }

  commands.push({
    command: "discover --deep",
    description: "Switch to deep discovery",
    when: "If user wants more thorough exploration",
  });

  commands.push({
    command: "discover --quick",
    description: "Switch to quick discovery",
    when: "If user wants to move faster",
  });

  return {
    situation,
    instructions,
    commands,
    context: {
      depth,
      gaps,
    },
  };
}

function getStarterQuestion(category: string): string {
  const starters: Record<string, string> = {
    problem: "What problem are we solving?",
    vision: "What does the ideal end state look like?",
    users: "Who are the primary users?",
    values: "What's the most important quality this solution must have?",
    constraints: "What's your current tech stack and team setup?",
    success: "How will we know if this is successful?",
    other: "What existing solutions have you looked at?",
  };
  return starters[category] || starters.problem;
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
  const requiredRemaining = remaining.filter((q) => q.required);

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
