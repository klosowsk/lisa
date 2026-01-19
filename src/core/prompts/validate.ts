/**
 * Validate Prompts for Lisa Engine
 *
 * AI guidance templates for validation, coverage, and integrity checks.
 */

import { AIGuidance, CommandSuggestion } from "../types.js";
import { ValidationIssue, Link, CoverageEntry } from "../schemas.js";
import { enhanceWithContext } from "./context-helpers.js";

// ============================================================================
// Full Validation Guidance
// ============================================================================

export interface FullValidationState {
  errors: number;
  warnings: number;
  info: number;
  brokenLinks: Link[];
  coverageGaps: Array<{ requirement: string; epic: string }>;
  orphanedItems: Array<{ type: string; id: string }>;
}

export function getFullValidationGuidance(state: FullValidationState): AIGuidance {
  const { errors, warnings, brokenLinks, coverageGaps, orphanedItems } = state;

  let situation: string;
  if (errors === 0 && warnings === 0) {
    situation = "All validations passed - project is in good shape";
  } else if (errors > 0) {
    situation = `Validation found ${errors} error(s) that need attention`;
  } else {
    situation = `Validation passed with ${warnings} warning(s)`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (errors === 0 && warnings === 0) {
    instructions.push("Project artifacts are consistent");
    instructions.push("Continue with implementation");
    commands.push({
      command: "status board",
      description: "View available stories",
      when: "To continue work",
    });
    return { situation, instructions, commands };
  }

  // Prioritize fixes
  if (brokenLinks.length > 0) {
    instructions.push(`Fix ${brokenLinks.length} broken link(s):`);
    for (const link of brokenLinks.slice(0, 3)) {
      instructions.push(`  - ${link.from.id} → ${link.to.id} (${link.type})`);
    }
    if (brokenLinks.length > 3) {
      instructions.push(`  ... and ${brokenLinks.length - 3} more`);
    }
  }

  if (coverageGaps.length > 0) {
    instructions.push(`Address ${coverageGaps.length} coverage gap(s):`);
    for (const gap of coverageGaps.slice(0, 3)) {
      instructions.push(`  - ${gap.requirement} needs stories`);
    }
    if (coverageGaps.length > 3) {
      instructions.push(`  ... and ${coverageGaps.length - 3} more`);
    }

    // Group by epic for commands
    const epicIds = [...new Set(coverageGaps.map((g) => g.epic))];
    for (const epicId of epicIds.slice(0, 2)) {
      commands.push({
        command: "plan stories",
        args: epicId,
        description: `Generate stories for ${epicId}`,
        when: "To cover missing requirements",
      });
    }
  }

  if (orphanedItems.length > 0) {
    instructions.push(`Review ${orphanedItems.length} orphaned item(s):`);
    for (const orphan of orphanedItems.slice(0, 3)) {
      instructions.push(`  - ${orphan.type}:${orphan.id} has no links`);
    }
    instructions.push("Consider linking to requirements or removing if obsolete");
  }

  commands.push({
    command: "validate",
    description: "Re-run validation",
    when: "After making fixes",
  });

  return { situation, instructions, commands };
}

// ============================================================================
// Link Validation Guidance
// ============================================================================

export interface LinkValidationState {
  totalLinks: number;
  validLinks: number;
  brokenLinks: Link[];
  orphans: Array<{ type: string; id: string; reason: string }>;
}

export function getLinkValidationGuidance(state: LinkValidationState): AIGuidance {
  const { totalLinks, brokenLinks, orphans } = state;

  let situation: string;
  if (brokenLinks.length === 0 && orphans.length === 0) {
    situation = `All ${totalLinks} links are valid`;
  } else if (brokenLinks.length > 0) {
    situation = `${brokenLinks.length} broken links found`;
  } else {
    situation = `${orphans.length} orphaned items found`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (brokenLinks.length === 0 && orphans.length === 0) {
    instructions.push("Link integrity is good");
    instructions.push("All references point to valid targets");
    return { situation, instructions, commands };
  }

  if (brokenLinks.length > 0) {
    instructions.push("Fix broken links:");
    for (const link of brokenLinks.slice(0, 5)) {
      if (link.type === "implements") {
        instructions.push(
          `  - Story ${link.from.id} references non-existent requirement ${link.to.id}`
        );
        instructions.push(`    → Either create the requirement or update the story`);
      } else if (link.type === "depends_on") {
        instructions.push(
          `  - Story ${link.from.id} depends on non-existent story ${link.to.id}`
        );
        instructions.push(`    → Either create the dependency or remove the reference`);
      }
    }
  }

  if (orphans.length > 0) {
    instructions.push("Review orphaned items:");
    for (const orphan of orphans.slice(0, 5)) {
      instructions.push(`  - ${orphan.type}:${orphan.id} - ${orphan.reason}`);
    }
    instructions.push("Orphans should either be linked to requirements or removed");
  }

  commands.push({
    command: "validate links",
    description: "Re-check links",
    when: "After fixing issues",
  });

  return { situation, instructions, commands };
}

// ============================================================================
// Coverage Validation Guidance
// ============================================================================

export interface CoverageValidationState {
  totalRequirements: number;
  coveredRequirements: number;
  coveragePercent: number;
  gaps: Array<{ requirement: string; epic: string; reason?: string }>;
  epicCoverage: Record<string, { covered: number; total: number; percent: number }>;
}

export function getCoverageValidationGuidance(state: CoverageValidationState): AIGuidance {
  const { coveragePercent, gaps, epicCoverage } = state;

  let situation: string;
  if (coveragePercent === 100) {
    situation = "100% requirement coverage achieved";
  } else if (coveragePercent >= 80) {
    situation = `${coveragePercent.toFixed(1)}% coverage - nearly complete`;
  } else if (coveragePercent >= 50) {
    situation = `${coveragePercent.toFixed(1)}% coverage - some gaps remain`;
  } else {
    situation = `${coveragePercent.toFixed(1)}% coverage - significant gaps`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (coveragePercent === 100) {
    instructions.push("All requirements have implementing stories");
    instructions.push("Continue with story implementation");
    commands.push({
      command: "status board",
      description: "View story board",
      when: "To work on stories",
    });
    return { situation, instructions, commands };
  }

  instructions.push("Generate stories for uncovered requirements:");

  // Group gaps by epic
  const gapsByEpic = new Map<string, string[]>();
  for (const gap of gaps) {
    if (!gapsByEpic.has(gap.epic)) {
      gapsByEpic.set(gap.epic, []);
    }
    gapsByEpic.get(gap.epic)!.push(gap.requirement);
  }

  for (const [epicId, reqs] of gapsByEpic) {
    const epicInfo = epicCoverage[epicId];
    const epicPercent = epicInfo?.percent || 0;
    instructions.push(`  ${epicId} (${epicPercent.toFixed(0)}% covered):`);
    for (const req of reqs.slice(0, 3)) {
      instructions.push(`    - ${req}`);
    }
    if (reqs.length > 3) {
      instructions.push(`    ... and ${reqs.length - 3} more`);
    }

    commands.push({
      command: "plan stories",
      args: epicId,
      description: `Generate stories for ${epicId}`,
      when: `To cover ${reqs.length} requirement(s)`,
    });
  }

  return { situation, instructions, commands };
}

// ============================================================================
// Epic Validation Guidance
// ============================================================================

export interface EpicValidationState {
  epicId: string;
  epicName: string;
  hasEpicJson: boolean;
  hasPrd: boolean;
  hasArchitecture: boolean;
  storyCount: number;
  coveragePercent: number;
  uncoveredRequirements: string[];
}

export function getEpicValidationGuidance(state: EpicValidationState): AIGuidance {
  const {
    epicId,
    hasEpicJson,
    hasPrd,
    hasArchitecture,
    storyCount,
    coveragePercent,
    uncoveredRequirements,
  } = state;

  const missingArtifacts: string[] = [];
  if (!hasEpicJson) missingArtifacts.push("epic.json");
  if (!hasPrd) missingArtifacts.push("prd.md");
  if (!hasArchitecture) missingArtifacts.push("architecture.md");

  let situation: string;
  if (missingArtifacts.length > 0) {
    situation = `Epic ${epicId} missing: ${missingArtifacts.join(", ")}`;
  } else if (coveragePercent < 100) {
    situation = `Epic ${epicId} at ${coveragePercent.toFixed(0)}% coverage`;
  } else if (storyCount === 0) {
    situation = `Epic ${epicId} has no stories`;
  } else {
    situation = `Epic ${epicId} is fully covered with ${storyCount} stories`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (missingArtifacts.length > 0) {
    instructions.push("Create missing artifacts:");
    for (const artifact of missingArtifacts) {
      if (artifact === "prd.md") {
        instructions.push("  - Generate PRD with requirements");
        commands.push({
          command: "plan prd",
          args: epicId,
          description: "Generate PRD",
          when: "To define requirements",
        });
      } else if (artifact === "architecture.md") {
        instructions.push("  - Generate architecture document");
        commands.push({
          command: "plan architecture",
          args: epicId,
          description: "Generate architecture",
          when: "After PRD is complete",
        });
      }
    }
    return enhanceWithContext(
      { situation, instructions, commands },
      { target: { type: "epic", id: epicId } }
    );
  }

  if (coveragePercent < 100) {
    instructions.push("Generate stories for uncovered requirements:");
    for (const req of uncoveredRequirements.slice(0, 5)) {
      instructions.push(`  - ${req}`);
    }
    if (uncoveredRequirements.length > 5) {
      instructions.push(`  ... and ${uncoveredRequirements.length - 5} more`);
    }
    commands.push({
      command: "plan stories",
      args: epicId,
      description: "Generate stories",
      when: "To achieve full coverage",
    });
    return enhanceWithContext(
      { situation, instructions, commands },
      { target: { type: "epic", id: epicId } }
    );
  }

  // All good
  instructions.push("Epic artifacts are complete");
  instructions.push("All requirements have implementing stories");
  instructions.push("Continue with story implementation");

  commands.push({
    command: "status board",
    description: "View story board",
    when: "To work on stories",
  });

  return enhanceWithContext(
    { situation, instructions, commands },
    { target: { type: "epic", id: epicId } }
  );
}

// ============================================================================
// Issues Summary Guidance
// ============================================================================

export function getIssuesSummaryGuidance(issues: ValidationIssue[]): AIGuidance {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  let situation: string;
  if (issues.length === 0) {
    situation = "No validation issues found";
  } else {
    situation = `${errors.length} error(s), ${warnings.length} warning(s) found`;
  }

  const instructions: string[] = [];
  const commands: CommandSuggestion[] = [];

  if (issues.length === 0) {
    instructions.push("Project is in good shape");
    return { situation, instructions, commands };
  }

  // Group by type
  const byType = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    if (!byType.has(issue.type)) {
      byType.set(issue.type, []);
    }
    byType.get(issue.type)!.push(issue);
  }

  instructions.push("Address issues by priority:");

  // Errors first
  for (const issue of errors.slice(0, 3)) {
    instructions.push(`  [ERROR] ${issue.message}`);
    if (issue.suggestion) {
      instructions.push(`    → ${issue.suggestion}`);
    }
  }

  // Then warnings
  for (const issue of warnings.slice(0, 2)) {
    instructions.push(`  [WARN] ${issue.message}`);
    if (issue.suggestion) {
      instructions.push(`    → ${issue.suggestion}`);
    }
  }

  if (issues.length > 5) {
    instructions.push(`  ... and ${issues.length - 5} more issues`);
  }

  commands.push({
    command: "validate",
    description: "Re-run validation",
    when: "After addressing issues",
  });

  return { situation, instructions, commands };
}
