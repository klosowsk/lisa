/**
 * Core Utilities for Lisa Engine
 *
 * These are pure utility functions used across the engine.
 * Output formatting is handled by adapters, not here.
 */

// ============================================================================
// Error Handling
// ============================================================================

export class LisaError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LisaError";
  }
}


// ============================================================================
// ID Generation
// ============================================================================

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);
}

// ============================================================================
// Date/Time
// ============================================================================

export function now(): string {
  return new Date().toISOString();
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(isoString: string): string {
  const date = new Date(isoString);
  const nowDate = new Date();
  const seconds = Math.floor((nowDate.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(isoString);
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateStoryId(id: string): boolean {
  return /^E\d+\.S\d+$/.test(id);
}

export function validateEpicId(id: string): boolean {
  return /^E\d+$/.test(id);
}

export function validateMilestoneId(id: string): boolean {
  return /^M\d+$/.test(id);
}

export function validateRequirementId(id: string): boolean {
  return /^E\d+\.R\d+$/.test(id);
}

export function parseStoryId(id: string): { epicId: string; storyNum: number } | null {
  const match = id.match(/^(E\d+)\.S(\d+)$/);
  if (!match) return null;
  return { epicId: match[1], storyNum: parseInt(match[2], 10) };
}

export function parseEpicId(id: string): { num: number } | null {
  const match = id.match(/^E(\d+)$/);
  if (!match) return null;
  return { num: parseInt(match[1], 10) };
}

// ============================================================================
// String Helpers
// ============================================================================

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

export function wrap(text: string, maxWidth: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.join("\n");
}

// ============================================================================
// Status Helpers
// ============================================================================

export function statusIcon(status: string): string {
  const icons: Record<string, string> = {
    // Project statuses
    active: "▶",
    paused: "⏸",

    // Epic statuses (derived)
    planned: "○",
    drafting: "◐",
    ready: "●",
    in_progress: "▶",
    done: "✓",
    deferred: "⏸",

    // Story statuses
    todo: "○",
    assigned: "◐",
    review: "◕",
    blocked: "⚠",

    // Artifact statuses
    pending: "○",
    complete: "✓",
    needs_review: "?",
    needs_update: "!",

    // Validation
    covered: "✓",
    gap: "✗",
    partial: "◐",
    valid: "✓",
    broken: "✗",
    error: "✗",
    warning: "⚠",
    info: "ℹ",
  };

  return icons[status] || "○";
}

/**
 * Returns a semantic status category for styling
 * Adapters can use this to apply appropriate colors
 */
export function statusCategory(
  status: string
): "positive" | "in_progress" | "attention" | "negative" | "neutral" {
  const categories: Record<string, "positive" | "in_progress" | "attention" | "negative" | "neutral"> = {
    // Positive
    done: "positive",
    complete: "positive",
    ready: "positive",
    covered: "positive",
    valid: "positive",

    // In progress
    in_progress: "in_progress",
    assigned: "in_progress",
    prd: "in_progress",
    architecture: "in_progress",
    stories: "in_progress",
    drafting: "in_progress",

    // Attention needed
    review: "attention",
    needs_review: "attention",
    needs_update: "attention",
    warning: "attention",
    partial: "attention",

    // Negative/Blocked
    blocked: "negative",
    error: "negative",
    gap: "negative",
    broken: "negative",

    // Neutral
    planned: "neutral",
    todo: "neutral",
    pending: "neutral",
    deferred: "neutral",
  };

  return categories[status] || "neutral";
}
