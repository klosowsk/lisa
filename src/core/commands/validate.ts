/**
 * Validate Commands for Lisa Engine
 *
 * Check artifact integrity, coverage, and links.
 */

import { StateManager } from "../state.js";
import {
  CommandResult,
  OutputSection,
  success,
  error,
  section,
} from "../types.js";
import { now, generateId, statusIcon, statusCategory } from "../utils.js";
import {
  Coverage,
  CoverageEntry,
  Links,
  Link,
  ValidationIssues,
  ValidationIssue,
} from "../schemas.js";
import {
  getFullValidationGuidance,
  getLinkValidationGuidance,
  getCoverageValidationGuidance,
  getEpicValidationGuidance,
} from "../prompts/validate.js";

// ============================================================================
// Types
// ============================================================================

export interface ValidationData {
  issues: ValidationIssue[];
  links: Links;
  coverage: Coverage;
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface LinksData {
  links: Links;
}

export interface CoverageData {
  coverage: Coverage;
}

export interface EpicValidationData {
  epicId: string;
  epicName: string;
  status: string;
  artifacts: {
    epic: boolean;
    prd: boolean;
    architecture: boolean;
    stories: number;
  };
  coverage: {
    total: number;
    covered: number;
    percent: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function validateSchemas(state: StateManager): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Check project.json
  try {
    const project = await state.readProject();
    if (!project) {
      issues.push({
        id: generateId("issue"),
        severity: "error",
        type: "missing_file",
        location: { type: "project", id: "project.json" },
        message: "project.json not found",
        suggestion: "Run 'discover init' to initialize",
      });
    }
  } catch (e) {
    issues.push({
      id: generateId("issue"),
      severity: "error",
      type: "invalid_schema",
      location: { type: "project", id: "project.json" },
      message: `Invalid project.json: ${(e as Error).message}`,
    });
  }

  // Check epic files
  const epicDirs = await state.listEpicDirs();
  for (const epicDir of epicDirs) {
    const [epicId] = epicDir.split("-");
    const slug = epicDir.split("-").slice(1).join("-");

    try {
      const epic = await state.readEpic(epicId, slug);
      if (!epic) {
        issues.push({
          id: generateId("issue"),
          severity: "error",
          type: "missing_file",
          location: { type: "epic", id: epicId },
          message: `epic.json not found for ${epicId}`,
        });
      }
    } catch (e) {
      issues.push({
        id: generateId("issue"),
        severity: "error",
        type: "invalid_schema",
        location: { type: "epic", id: epicId },
        message: `Invalid epic.json: ${(e as Error).message}`,
      });
    }
  }

  return issues;
}

async function validateLinksInternal(state: StateManager): Promise<Links> {
  const links: Link[] = [];
  const broken: Link[] = [];
  const orphans: { type: string; id: string; reason: string }[] = [];

  // Collect all valid IDs
  const validIds = new Set<string>();

  // Milestones
  const milestoneIndex = await state.readMilestoneIndex();
  if (milestoneIndex) {
    for (const m of milestoneIndex.milestones) {
      validIds.add(m.id);
    }
  }

  // Discovery items
  const context = await state.readDiscoveryContext();
  if (context?.values) {
    for (const v of context.values) {
      validIds.add(v.id);
    }
  }

  const constraints = await state.readConstraints();
  if (constraints?.constraints) {
    for (const c of constraints.constraints) {
      validIds.add(c.id);
    }
  }

  // Epics, requirements, stories
  const epicDirs = await state.listEpicDirs();
  for (const epicDir of epicDirs) {
    const [epicId] = epicDir.split("-");
    const slug = epicDir.split("-").slice(1).join("-");
    validIds.add(epicId);

    // Read PRD to extract requirement IDs
    const prd = await state.readPrd(epicId, slug);
    if (prd) {
      const reqMatches = prd.match(/### (?:E\d+\.)?(R\d+):/g);
      if (reqMatches) {
        for (const match of reqMatches) {
          const reqId = match.match(/R\d+/)?.[0];
          if (reqId) {
            validIds.add(`${epicId}.${reqId}`);
          }
        }
      }
    }

    // Stories
    const storiesFile = await state.readStories(epicId, slug);
    if (storiesFile) {
      for (const story of storiesFile.stories) {
        validIds.add(story.id);

        // Check story links
        for (const reqId of story.requirements) {
          const link: Link = {
            from: { type: "story", id: story.id },
            to: { type: "requirement", id: reqId },
            type: "implements",
            valid: validIds.has(reqId),
          };
          links.push(link);
          if (!link.valid) {
            broken.push(link);
          }
        }

        for (const depId of story.dependencies) {
          const link: Link = {
            from: { type: "story", id: story.id },
            to: { type: "story", id: depId },
            type: "depends_on",
            valid: validIds.has(depId),
          };
          links.push(link);
          if (!link.valid) {
            broken.push(link);
          }
        }

        // Check for orphan stories (no requirements)
        if (story.requirements.length === 0) {
          orphans.push({
            type: "story",
            id: story.id,
            reason: "Story has no requirement links",
          });
        }
      }
    }
  }

  return {
    links,
    broken,
    orphans,
    summary: {
      total_links: links.length,
      valid: links.length - broken.length,
      broken: broken.length,
      orphans: orphans.length,
    },
    last_validated: now(),
  };
}

async function validateCoverageInternal(state: StateManager): Promise<Coverage> {
  const coverage: Coverage["coverage"] = {};
  const gaps: Coverage["gaps"] = [];
  let totalRequirements = 0;
  let coveredRequirements = 0;

  const epicDirs = await state.listEpicDirs();

  for (const epicDir of epicDirs) {
    const [epicId] = epicDir.split("-");
    const slug = epicDir.split("-").slice(1).join("-");

    coverage[epicId] = {};

    // Extract requirements from PRD
    const prd = await state.readPrd(epicId, slug);
    const requirements: string[] = [];

    if (prd) {
      const reqMatches = prd.match(/### (?:E\d+\.)?(R\d+):/g);
      if (reqMatches) {
        for (const match of reqMatches) {
          const reqId = match.match(/R\d+/)?.[0];
          if (reqId) {
            requirements.push(`${epicId}.${reqId}`);
          }
        }
      }
    }

    // Get stories and their coverage
    const storiesFile = await state.readStories(epicId, slug);
    const storyReqs = new Map<string, string[]>();

    if (storiesFile) {
      for (const story of storiesFile.stories) {
        for (const reqId of story.requirements) {
          if (!storyReqs.has(reqId)) {
            storyReqs.set(reqId, []);
          }
          storyReqs.get(reqId)!.push(story.id);
        }
      }
    }

    // Check each requirement
    for (const reqId of requirements) {
      totalRequirements++;
      const stories = storyReqs.get(reqId) || [];

      const entry: CoverageEntry = {
        stories,
        status: stories.length > 0 ? "covered" : "gap",
      };

      coverage[epicId][reqId] = entry;

      if (stories.length > 0) {
        coveredRequirements++;
      } else {
        gaps.push({
          requirement: reqId,
          epic: epicId,
          reason: "No stories implement this requirement",
        });
      }
    }
  }

  return {
    coverage,
    summary: {
      total_requirements: totalRequirements,
      covered: coveredRequirements,
      gaps: gaps.length,
      coverage_percent:
        totalRequirements > 0 ? (coveredRequirements / totalRequirements) * 100 : 0,
    },
    gaps,
    last_validated: now(),
  };
}

// ============================================================================
// Full Validation
// ============================================================================

export async function runFullValidation(
  state: StateManager
): Promise<CommandResult<ValidationData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const issues: ValidationIssue[] = [];
  const sections: OutputSection[] = [section.header("Validation")];

  // Check schemas/types
  sections.push(section.subheader("Schema Validation"));
  const schemaIssues = await validateSchemas(state);
  issues.push(...schemaIssues);
  if (schemaIssues.length === 0) {
    sections.push(section.success("All schemas valid"));
  } else {
    sections.push(section.error(`${schemaIssues.length} schema issues`));
  }

  // Check links
  sections.push(section.blank());
  sections.push(section.subheader("Link Validation"));
  const linkResult = await validateLinksInternal(state);
  if (linkResult.broken.length === 0) {
    sections.push(section.success(`${linkResult.summary.total_links} links, 0 broken`));
  } else {
    sections.push(section.error(`${linkResult.summary.broken} broken links`));
    for (const link of linkResult.broken) {
      issues.push({
        id: generateId("issue"),
        severity: "error",
        type: "broken_link",
        location: { type: link.from.type, id: link.from.id },
        message: `Broken link to ${link.to.type}:${link.to.id}`,
        suggestion: `Verify ${link.to.id} exists or remove reference`,
      });
    }
  }

  if (linkResult.orphans.length > 0) {
    sections.push(section.warning(`${linkResult.summary.orphans} orphaned items`));
    for (const orphan of linkResult.orphans) {
      issues.push({
        id: generateId("issue"),
        severity: "warning",
        type: "orphan_artifact",
        location: { type: orphan.type, id: orphan.id },
        message: orphan.reason,
        suggestion: "Link to requirements or delete if obsolete",
      });
    }
  }

  // Check coverage
  sections.push(section.blank());
  sections.push(section.subheader("Coverage Validation"));
  const coverageResult = await validateCoverageInternal(state);
  if (coverageResult.gaps.length === 0) {
    sections.push(
      section.success(`${coverageResult.summary.coverage_percent.toFixed(1)}% coverage`)
    );
  } else {
    sections.push(
      section.warning(
        `${coverageResult.summary.coverage_percent.toFixed(1)}% coverage (${coverageResult.summary.gaps} gaps)`
      )
    );
    for (const gap of coverageResult.gaps) {
      issues.push({
        id: generateId("issue"),
        severity: "error",
        type: "coverage_gap",
        location: { type: "requirement", id: gap.requirement },
        message: `Requirement has no implementing stories`,
        suggestion: `Generate stories for ${gap.requirement}`,
      });
    }
  }

  // Save validation results
  await state.writeLinks(linkResult);
  await state.writeCoverage(coverageResult);

  // Summary
  sections.push(section.blank());
  sections.push(section.divider());

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;

  const issuesResult: ValidationIssues = {
    issues,
    summary: { errors, warnings, info },
    last_validated: now(),
  };

  await state.writeValidationIssues(issuesResult);

  sections.push(section.blank());
  if (errors === 0 && warnings === 0) {
    sections.push(section.success("All validations passed!"));
  } else {
    if (errors > 0) {
      sections.push(section.error(`${errors} error(s)`));
    }
    if (warnings > 0) {
      sections.push(section.warning(`${warnings} warning(s)`));
    }

    sections.push(section.blank());
    sections.push(section.subheader("Issues"));
    for (const issue of issues) {
      const icon = statusIcon(issue.severity);
      sections.push({
        type: "status",
        content: {
          icon,
          text: `[${issue.severity.toUpperCase()}] ${issue.message}`,
          status: issue.severity,
          category: statusCategory(issue.severity),
        },
      });
      sections.push(section.dim(`     Location: ${issue.location.type}:${issue.location.id}`));
      if (issue.suggestion) {
        sections.push(section.dim(`     Suggestion: ${issue.suggestion}`));
      }
    }
  }

  const data: ValidationData = {
    issues,
    links: linkResult,
    coverage: coverageResult,
    summary: { errors, warnings, info },
  };

  const aiGuidance = getFullValidationGuidance({
    errors,
    warnings,
    info,
    brokenLinks: linkResult.broken,
    coverageGaps: coverageResult.gaps,
    orphanedItems: linkResult.orphans.map((o) => ({ type: o.type, id: o.id })),
  });

  return success(data, sections, aiGuidance);
}

// ============================================================================
// Link Validation
// ============================================================================

export async function validateLinks(state: StateManager): Promise<CommandResult<LinksData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const linksResult = await validateLinksInternal(state);
  await state.writeLinks(linksResult);

  const sections: OutputSection[] = [
    section.header("Link Validation"),
    section.subheader("Summary"),
    section.text(`  Total links: ${linksResult.summary.total_links}`),
    section.text(`  Valid: ${linksResult.summary.valid}`),
    section.text(`  Broken: ${linksResult.summary.broken}`),
    section.text(`  Orphans: ${linksResult.summary.orphans}`),
  ];

  if (linksResult.broken.length > 0) {
    sections.push(section.blank());
    sections.push(section.subheader("Broken Links"));
    for (const link of linksResult.broken) {
      sections.push(section.error(`${link.from.id} → ${link.to.id} (${link.type})`));
    }
  }

  if (linksResult.orphans.length > 0) {
    sections.push(section.blank());
    sections.push(section.subheader("Orphan Items"));
    for (const orphan of linksResult.orphans) {
      sections.push(section.warning(`${orphan.type}:${orphan.id} - ${orphan.reason}`));
    }
  }

  const aiGuidance = getLinkValidationGuidance({
    totalLinks: linksResult.summary.total_links,
    validLinks: linksResult.summary.valid,
    brokenLinks: linksResult.broken,
    orphans: linksResult.orphans,
  });

  return success({ links: linksResult }, sections, aiGuidance);
}

// ============================================================================
// Coverage Validation
// ============================================================================

export async function validateCoverage(state: StateManager): Promise<CommandResult<CoverageData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  const coverageResult = await validateCoverageInternal(state);
  await state.writeCoverage(coverageResult);

  const sections: OutputSection[] = [
    section.header("Coverage Validation"),
    section.subheader("Summary"),
    section.text(`  Total requirements: ${coverageResult.summary.total_requirements}`),
    section.text(`  Covered: ${coverageResult.summary.covered}`),
    section.text(`  Gaps: ${coverageResult.summary.gaps}`),
    section.text(`  Coverage: ${coverageResult.summary.coverage_percent.toFixed(1)}%`),
    section.blank(),
    section.subheader("By Epic"),
  ];

  for (const [epicId, reqs] of Object.entries(coverageResult.coverage)) {
    const epicReqs = Object.entries(reqs);
    const covered = epicReqs.filter(([_, e]) => e.status === "covered").length;
    const total = epicReqs.length;
    const percent = total > 0 ? (covered / total) * 100 : 0;

    sections.push(section.text(`  ${epicId}: ${percent.toFixed(0)}% (${covered}/${total})`));

    for (const [reqId, entry] of epicReqs) {
      const icon = statusIcon(entry.status);
      sections.push({
        type: "status",
        content: {
          icon,
          text: `    ${reqId}: ${entry.stories.join(", ") || "no stories"}`,
          status: entry.status,
          category: statusCategory(entry.status),
        },
      });
    }
    sections.push(section.blank());
  }

  // Gaps
  if (coverageResult.gaps.length > 0) {
    sections.push(section.subheader("Gaps (Need Stories)"));
    for (const gap of coverageResult.gaps) {
      sections.push(section.error(gap.requirement));
    }
  }

  // Build epicCoverage for guidance
  const epicCoverage: Record<string, { covered: number; total: number; percent: number }> = {};
  for (const [epicId, reqs] of Object.entries(coverageResult.coverage)) {
    const epicReqs = Object.entries(reqs);
    const covered = epicReqs.filter(([_, e]) => e.status === "covered").length;
    const total = epicReqs.length;
    epicCoverage[epicId] = {
      covered,
      total,
      percent: total > 0 ? (covered / total) * 100 : 0,
    };
  }

  const aiGuidance = getCoverageValidationGuidance({
    totalRequirements: coverageResult.summary.total_requirements,
    coveredRequirements: coverageResult.summary.covered,
    coveragePercent: coverageResult.summary.coverage_percent,
    gaps: coverageResult.gaps,
    epicCoverage,
  });

  return success({ coverage: coverageResult }, sections, aiGuidance);
}

// ============================================================================
// Epic Validation
// ============================================================================

export async function validateEpic(
  state: StateManager,
  options: { epicId: string }
): Promise<CommandResult<EpicValidationData>> {
  if (!(await state.isInitialized())) {
    return error("No Lisa project found.", "NOT_INITIALIZED");
  }

  // Find epic
  const epicDirs = await state.listEpicDirs();
  const epicDir = epicDirs.find((d) => d.startsWith(`${options.epicId}-`));

  if (!epicDir) {
    return error(`Epic ${options.epicId} not found.`, "NOT_FOUND");
  }

  const slug = epicDir.split("-").slice(1).join("-");
  const epicResult = await state.getEpicWithStatus(options.epicId, slug);
  const epic = epicResult?.epic;
  const epicStatus = epicResult?.status || "unknown";
  const prd = await state.readPrd(options.epicId, slug);
  const arch = await state.readArchitecture(options.epicId, slug);
  const storiesFile = await state.readStories(options.epicId, slug);

  const sections: OutputSection[] = [section.header(`Validation: ${options.epicId}`)];

  // Epic metadata
  sections.push(section.subheader("Epic Metadata"));
  if (epic) {
    sections.push(section.success(`epic.json valid`));
    sections.push(section.dim(`  Name: ${epic.name}`));
    sections.push(section.dim(`  Status: ${epicStatus}`));
  } else {
    sections.push(section.error("epic.json missing or invalid"));
  }

  // PRD
  sections.push(section.blank());
  sections.push(section.subheader("PRD"));
  let reqCount = 0;
  if (prd) {
    sections.push(section.success("prd.md exists"));
    const reqMatches = prd.match(/### (?:E\d+\.)?R\d+:/g);
    reqCount = reqMatches?.length || 0;
    sections.push(section.dim(`  Requirements: ${reqCount}`));
    const acCount = (prd.match(/- \[ \]/g) || []).length;
    sections.push(section.dim(`  Acceptance criteria: ${acCount}`));
  } else {
    sections.push(section.warning("prd.md not found"));
  }

  // Architecture
  sections.push(section.blank());
  sections.push(section.subheader("Architecture"));
  if (arch) {
    sections.push(section.success("architecture.md exists"));
    sections.push(section.dim(`  Length: ${arch.length} chars`));
  } else {
    sections.push(section.warning("architecture.md not found"));
  }

  // Stories
  sections.push(section.blank());
  sections.push(section.subheader("Stories"));
  const storyCount = storiesFile?.stories.length || 0;
  if (storiesFile && storyCount > 0) {
    sections.push(section.success(`${storyCount} stories`));

    const statusCounts: Record<string, number> = {};
    for (const story of storiesFile.stories) {
      statusCounts[story.status] = (statusCounts[story.status] || 0) + 1;
    }

    for (const [status, count] of Object.entries(statusCounts)) {
      const icon = statusIcon(status);
      sections.push(section.dim(`  ${icon} ${status}: ${count}`));
    }
  } else {
    sections.push(section.warning("No stories found"));
  }

  // Coverage for this epic
  sections.push(section.blank());
  sections.push(section.subheader("Coverage"));

  let coverageTotal = 0;
  let coverageCovered = 0;
  let coveragePercent = 0;
  const uncoveredRequirements: string[] = [];

  if (prd && storiesFile) {
    const reqMatches = prd.match(/### (?:E\d+\.)?(R\d+):/g) || [];
    const requirements = reqMatches.map((m) => {
      const id = m.match(/R\d+/)?.[0];
      return `${options.epicId}.${id}`;
    });

    coverageTotal = requirements.length;
    for (const reqId of requirements) {
      const hasStory = storiesFile.stories.some((s) => s.requirements.includes(reqId));
      if (hasStory) {
        coverageCovered++;
        sections.push(section.success(`${reqId} covered`));
      } else {
        uncoveredRequirements.push(reqId);
        sections.push(section.error(`${reqId} NOT covered`));
      }
    }

    sections.push(section.blank());
    coveragePercent = coverageTotal > 0 ? (coverageCovered / coverageTotal) * 100 : 0;
    sections.push(
      section.info(`Coverage: ${coveragePercent.toFixed(1)}% (${coverageCovered}/${coverageTotal})`)
    );
  } else {
    sections.push(section.dim("Cannot calculate coverage without PRD and stories"));
  }

  const data: EpicValidationData = {
    epicId: options.epicId,
    epicName: epic?.name || options.epicId,
    status: epicStatus,
    artifacts: {
      epic: !!epic,
      prd: !!prd,
      architecture: !!arch,
      stories: storyCount,
    },
    coverage: {
      total: coverageTotal,
      covered: coverageCovered,
      percent: coveragePercent,
    },
  };

  const aiGuidance = getEpicValidationGuidance({
    epicId: options.epicId,
    epicName: epic?.name || options.epicId,
    hasEpicJson: !!epic,
    hasPrd: !!prd,
    hasArchitecture: !!arch,
    storyCount,
    coveragePercent,
    uncoveredRequirements,
  });

  return success(data, sections, aiGuidance);
}
