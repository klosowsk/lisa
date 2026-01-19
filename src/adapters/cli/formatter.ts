/**
 * CLI Formatter for Lisa Engine
 *
 * Formats CommandResult output for terminal display.
 */

import chalk from "chalk";
import { CommandResult, OutputSection, AIGuidance } from "../../core/types.js";
import { statusCategory } from "../../core/utils.js";

// ============================================================================
// Terminal Output Helpers
// ============================================================================

export const output = {
  header(text: string): void {
    console.log();
    console.log(chalk.bold.cyan(`━━━ ${text.toUpperCase()} ━━━`));
    console.log();
  },

  subheader(text: string): void {
    console.log(chalk.bold(text));
  },

  success(text: string): void {
    console.log(chalk.green(`✓ ${text}`));
  },

  error(text: string): void {
    console.log(chalk.red(`✗ ${text}`));
  },

  warning(text: string): void {
    console.log(chalk.yellow(`⚠ ${text}`));
  },

  info(text: string): void {
    console.log(chalk.blue(`ℹ ${text}`));
  },

  dim(text: string): void {
    console.log(chalk.dim(text));
  },

  list(items: string[], indent = 2): void {
    const prefix = " ".repeat(indent);
    for (const item of items) {
      console.log(`${prefix}• ${item}`);
    }
  },

  numberedList(items: string[], indent = 2): void {
    const prefix = " ".repeat(indent);
    items.forEach((item, i) => {
      console.log(`${prefix}${i + 1}. ${item}`);
    });
  },

  table(rows: string[][], headers?: string[]): void {
    if (rows.length === 0) return;

    // Calculate column widths
    const widths: number[] = [];
    const allRows = headers ? [headers, ...rows] : rows;

    for (const row of allRows) {
      row.forEach((cell, i) => {
        widths[i] = Math.max(widths[i] || 0, cell.length);
      });
    }

    // Print headers
    if (headers) {
      const headerLine = headers
        .map((h, i) => chalk.bold(h.padEnd(widths[i])))
        .join("  ");
      console.log(headerLine);
      console.log(chalk.dim("─".repeat(headerLine.length)));
    }

    // Print rows
    for (const row of rows) {
      const line = row.map((cell, i) => cell.padEnd(widths[i])).join("  ");
      console.log(line);
    }
  },

  progressBar(current: number, total: number, width = 20): string {
    const percentage = total > 0 ? current / total : 0;
    const filled = Math.round(width * percentage);
    const empty = width - filled;
    return `[${chalk.green("█".repeat(filled))}${chalk.dim("░".repeat(empty))}]`;
  },

  divider(): void {
    console.log(chalk.dim("─".repeat(60)));
  },

  blank(): void {
    console.log();
  },
};

// ============================================================================
// Status Color Helper
// ============================================================================

function getStatusColor(status: string): (text: string) => string {
  const category = statusCategory(status);
  switch (category) {
    case "positive":
      return chalk.green;
    case "in_progress":
      return chalk.blue;
    case "attention":
      return chalk.yellow;
    case "negative":
      return chalk.red;
    case "neutral":
    default:
      return chalk.dim;
  }
}

// ============================================================================
// Section Renderer
// ============================================================================

function renderSection(section: OutputSection): void {
  switch (section.type) {
    case "header":
      output.header(section.title || "");
      break;

    case "subheader":
      output.subheader(section.title || "");
      break;

    case "text":
      const text = String(section.content || "");
      switch (section.style) {
        case "success":
          output.success(text);
          break;
        case "error":
          output.error(text);
          break;
        case "warning":
          output.warning(text);
          break;
        case "info":
          output.info(text);
          break;
        case "dim":
          output.dim(text);
          break;
        default:
          console.log(text);
      }
      break;

    case "list":
      if (section.title) {
        output.subheader(section.title);
      }
      if (Array.isArray(section.content)) {
        output.list(section.content);
      }
      break;

    case "numbered_list":
      if (section.title) {
        output.subheader(section.title);
      }
      if (Array.isArray(section.content)) {
        output.numberedList(section.content);
      }
      break;

    case "table":
      if (section.title) {
        output.subheader(section.title);
      }
      const tableContent = section.content as { rows: string[][]; headers?: string[] };
      if (tableContent && tableContent.rows) {
        output.table(tableContent.rows, tableContent.headers);
      }
      break;

    case "status":
      const statusContent = section.content as {
        icon?: string;
        text: string;
        status: string;
        category?: string;
      };
      if (statusContent) {
        const colorFn = getStatusColor(statusContent.status);
        const icon = statusContent.icon || "";
        console.log(colorFn(`${icon} ${statusContent.text}`));
      }
      break;

    case "progress":
      const progressContent = section.content as {
        current: number;
        total: number;
        label?: string;
        percent?: number;
      };
      if (progressContent) {
        const bar = output.progressBar(progressContent.current, progressContent.total);
        const percent = progressContent.percent ?? Math.round((progressContent.current / progressContent.total) * 100);
        const label = progressContent.label || "";
        console.log(`  ${label ? label + " " : ""}${bar} ${percent}%`);
      }
      break;

    case "divider":
      output.divider();
      break;

    case "blank":
      output.blank();
      break;

    case "context":
      // Context sections can contain arbitrary data
      if (section.content) {
        console.log(JSON.stringify(section.content, null, 2));
      }
      break;
  }
}

// ============================================================================
// AI Guidance Renderer
// ============================================================================

function renderAIGuidance(guidance: AIGuidance): void {
  output.blank();
  output.divider();
  output.blank();
  output.info("INSTRUCTIONS FOR CLAUDE:");

  guidance.instructions.forEach((instruction, i) => {
    output.info(`${i + 1}. ${instruction}`);
  });

  output.blank();

  if (guidance.commands.length > 0) {
    output.dim("Available commands:");
    for (const cmd of guidance.commands) {
      const cmdStr = cmd.args ? `${cmd.command} ${cmd.args}` : cmd.command;
      output.dim(`  ${cmdStr}`);
      if (cmd.when) {
        output.dim(`    When: ${cmd.when}`);
      }
    }
  }

  output.blank();
}

// ============================================================================
// Main Formatter
// ============================================================================

/**
 * Format a CommandResult for terminal output
 */
export function formatForTerminal(result: CommandResult): void {
  // Render all sections
  for (const section of result.sections) {
    renderSection(section);
  }

  // Render AI guidance if present
  if (result.aiGuidance) {
    renderAIGuidance(result.aiGuidance);
  }
}

/**
 * Format and print an error result
 */
export function formatError(result: CommandResult): void {
  if (result.error) {
    output.error(result.error);
  }
  if (result.errorCode) {
    output.dim(`  Error code: ${result.errorCode}`);
  }
}

/**
 * Handle a CommandResult - format for terminal and exit with appropriate code
 */
export function handleResult(result: CommandResult): void {
  if (result.status === "error") {
    formatError(result);
    process.exit(1);
  }

  formatForTerminal(result);
}
