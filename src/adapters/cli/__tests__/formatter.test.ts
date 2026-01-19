import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { output, formatForTerminal, formatError, handleResult } from "../formatter.js";
import { CommandResult, OutputSection } from "../../../core/types.js";

// Mock console.log to capture output
const mockLog = vi.fn();
const originalLog = console.log;

beforeEach(() => {
  console.log = mockLog;
  mockLog.mockClear();
});

afterEach(() => {
  console.log = originalLog;
});

describe("formatter", () => {
  // ==========================================================================
  // output helpers
  // ==========================================================================

  describe("output helpers", () => {
    describe("progressBar", () => {
      it("should return empty bar for 0 progress", () => {
        const bar = output.progressBar(0, 10);
        expect(bar).toContain("[");
        expect(bar).toContain("]");
        // Should have 20 empty characters (default width)
        expect(bar).toMatch(/░{20}/);
      });

      it("should return full bar for 100% progress", () => {
        const bar = output.progressBar(10, 10);
        expect(bar).toContain("[");
        expect(bar).toContain("]");
        // Should have 20 filled characters
        expect(bar).toMatch(/█{20}/);
      });

      it("should return half bar for 50% progress", () => {
        const bar = output.progressBar(5, 10);
        // Should have 10 filled and 10 empty
        expect(bar).toMatch(/█{10}/);
        expect(bar).toMatch(/░{10}/);
      });

      it("should handle custom width", () => {
        const bar = output.progressBar(5, 10, 10);
        // Should have 5 filled and 5 empty with width=10
        expect(bar).toMatch(/█{5}/);
        expect(bar).toMatch(/░{5}/);
      });

      it("should handle zero total (avoid division by zero)", () => {
        const bar = output.progressBar(0, 0);
        // Should return empty bar
        expect(bar).toMatch(/░{20}/);
      });

      it("should throw for negative progress", () => {
        // Negative progress causes invalid repeat count
        expect(() => output.progressBar(-5, 10)).toThrow();
      });
    });

    describe("header", () => {
      it("should output header with uppercase text", () => {
        output.header("test header");
        // Should have 3 calls: blank, header text, blank
        expect(mockLog).toHaveBeenCalledTimes(3);
        // Middle call should contain uppercased text
        const headerCall = mockLog.mock.calls[1][0];
        expect(headerCall).toContain("TEST HEADER");
      });
    });

    describe("subheader", () => {
      it("should output bold text", () => {
        output.subheader("Sub Header");
        expect(mockLog).toHaveBeenCalledTimes(1);
      });
    });

    describe("success", () => {
      it("should output with checkmark", () => {
        output.success("Operation complete");
        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toContain("✓");
      });
    });

    describe("error", () => {
      it("should output with X mark", () => {
        output.error("Something failed");
        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toContain("✗");
      });
    });

    describe("warning", () => {
      it("should output with warning symbol", () => {
        output.warning("Be careful");
        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toContain("⚠");
      });
    });

    describe("info", () => {
      it("should output with info symbol", () => {
        output.info("FYI");
        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toContain("ℹ");
      });
    });

    describe("dim", () => {
      it("should output text", () => {
        output.dim("subtle text");
        expect(mockLog).toHaveBeenCalledTimes(1);
      });
    });

    describe("list", () => {
      it("should output bullet points", () => {
        output.list(["item 1", "item 2", "item 3"]);
        expect(mockLog).toHaveBeenCalledTimes(3);
        expect(mockLog.mock.calls[0][0]).toContain("•");
        expect(mockLog.mock.calls[0][0]).toContain("item 1");
      });

      it("should use default indent of 2", () => {
        output.list(["test"]);
        expect(mockLog.mock.calls[0][0]).toMatch(/^\s{2}•/);
      });

      it("should use custom indent", () => {
        output.list(["test"], 4);
        expect(mockLog.mock.calls[0][0]).toMatch(/^\s{4}•/);
      });
    });

    describe("numberedList", () => {
      it("should output numbered items", () => {
        output.numberedList(["first", "second", "third"]);
        expect(mockLog).toHaveBeenCalledTimes(3);
        expect(mockLog.mock.calls[0][0]).toContain("1.");
        expect(mockLog.mock.calls[1][0]).toContain("2.");
        expect(mockLog.mock.calls[2][0]).toContain("3.");
      });

      it("should use custom indent", () => {
        output.numberedList(["test"], 6);
        expect(mockLog.mock.calls[0][0]).toMatch(/^\s{6}1\./);
      });
    });

    describe("table", () => {
      it("should output nothing for empty rows", () => {
        output.table([]);
        expect(mockLog).not.toHaveBeenCalled();
      });

      it("should output rows without headers", () => {
        output.table([
          ["a", "b"],
          ["c", "d"],
        ]);
        expect(mockLog).toHaveBeenCalledTimes(2);
      });

      it("should output headers with separator line", () => {
        output.table(
          [
            ["data1", "data2"],
          ],
          ["Col1", "Col2"]
        );
        // Header line + separator + data row
        expect(mockLog).toHaveBeenCalledTimes(3);
      });

      it("should pad columns to equal width", () => {
        output.table([
          ["short", "verylongvalue"],
          ["x", "y"],
        ]);
        // All rows should be padded
        expect(mockLog).toHaveBeenCalledTimes(2);
      });
    });

    describe("divider", () => {
      it("should output horizontal line", () => {
        output.divider();
        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toContain("─");
      });
    });

    describe("blank", () => {
      it("should output empty line", () => {
        output.blank();
        expect(mockLog).toHaveBeenCalledTimes(1);
        expect(mockLog.mock.calls[0][0]).toBe(undefined); // console.log() with no args
      });
    });
  });

  // ==========================================================================
  // formatForTerminal
  // ==========================================================================

  describe("formatForTerminal", () => {
    it("should render header sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "header", title: "My Header" }],
      };

      formatForTerminal(result);

      // Header has 3 log calls
      expect(mockLog).toHaveBeenCalled();
      const allOutput = mockLog.mock.calls.map((c) => c[0]).join("\n");
      expect(allOutput).toContain("MY HEADER");
    });

    it("should render subheader sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "subheader", title: "Sub" }],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(1);
    });

    it("should render text sections with different styles", () => {
      const styles: Array<OutputSection["style"]> = [
        "success",
        "error",
        "warning",
        "info",
        "dim",
        undefined,
      ];

      for (const style of styles) {
        mockLog.mockClear();
        const result: CommandResult = {
          status: "success",
          data: {},
          sections: [{ type: "text", content: "test text", style }],
        };
        formatForTerminal(result);
        expect(mockLog).toHaveBeenCalledTimes(1);
      }
    });

    it("should render list sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "list", content: ["a", "b", "c"] }],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(3);
    });

    it("should render list sections with title", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "list", title: "Items", content: ["a", "b"] }],
      };

      formatForTerminal(result);
      // Title + 2 items
      expect(mockLog).toHaveBeenCalledTimes(3);
    });

    it("should render numbered_list sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "numbered_list", content: ["first", "second"] }],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(2);
    });

    it("should render table sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [
          {
            type: "table",
            content: {
              rows: [["a", "b"]],
              headers: ["H1", "H2"],
            },
          },
        ],
      };

      formatForTerminal(result);
      // Header + separator + row
      expect(mockLog).toHaveBeenCalledTimes(3);
    });

    it("should render status sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [
          {
            type: "status",
            content: {
              icon: "✓",
              text: "All good",
              status: "done",
            },
          },
        ],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(1);
      expect(mockLog.mock.calls[0][0]).toContain("All good");
    });

    it("should render progress sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [
          {
            type: "progress",
            content: {
              current: 5,
              total: 10,
              label: "Progress",
            },
          },
        ],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(1);
      expect(mockLog.mock.calls[0][0]).toContain("Progress");
      expect(mockLog.mock.calls[0][0]).toContain("50%");
    });

    it("should render progress sections with custom percent", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [
          {
            type: "progress",
            content: {
              current: 3,
              total: 10,
              percent: 33,
            },
          },
        ],
      };

      formatForTerminal(result);
      expect(mockLog.mock.calls[0][0]).toContain("33%");
    });

    it("should render divider sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "divider" }],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(1);
    });

    it("should render blank sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "blank" }],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(1);
    });

    it("should render context sections as JSON", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "context", content: { key: "value" } }],
      };

      formatForTerminal(result);
      expect(mockLog).toHaveBeenCalledTimes(1);
      expect(mockLog.mock.calls[0][0]).toContain('"key"');
      expect(mockLog.mock.calls[0][0]).toContain('"value"');
    });

    it("should render AI guidance when present", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [],
        aiGuidance: {
          situation: "Test situation for AI",
          instructions: ["Do this", "Then do that"],
          commands: [
            { command: "test cmd", description: "Test command" },
            { command: "other", args: "arg1", when: "condition", description: "Other" },
          ],
        },
      };

      formatForTerminal(result);

      const allOutput = mockLog.mock.calls.map((c) => c[0]).join("\n");
      expect(allOutput).toContain("INSTRUCTIONS FOR CLAUDE");
      expect(allOutput).toContain("1. Do this");
      expect(allOutput).toContain("2. Then do that");
      expect(allOutput).toContain("test cmd");
      expect(allOutput).toContain("other arg1");
      expect(allOutput).toContain("When: condition");
    });

    it("should handle multiple sections", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [
          { type: "header", title: "Title" },
          { type: "text", content: "Some text" },
          { type: "divider" },
          { type: "list", content: ["item"] },
        ],
      };

      formatForTerminal(result);
      // 3 (header) + 1 (text) + 1 (divider) + 1 (list item) = 6
      expect(mockLog).toHaveBeenCalledTimes(6);
    });
  });

  // ==========================================================================
  // formatError
  // ==========================================================================

  describe("formatError", () => {
    it("should output error message", () => {
      const result: CommandResult = {
        status: "error",
        data: null,
        sections: [],
        error: "Something went wrong",
        errorCode: "ERROR",
      };

      formatError(result);
      expect(mockLog).toHaveBeenCalled();
      expect(mockLog.mock.calls[0][0]).toContain("✗");
      expect(mockLog.mock.calls[0][0]).toContain("Something went wrong");
    });

    it("should output error code when present", () => {
      const result: CommandResult = {
        status: "error",
        data: null,
        sections: [],
        error: "Failed",
        errorCode: "NOT_FOUND",
      };

      formatError(result);
      expect(mockLog).toHaveBeenCalledTimes(2);
      expect(mockLog.mock.calls[1][0]).toContain("NOT_FOUND");
    });

    it("should handle missing error message gracefully", () => {
      // ErrorResult requires error and errorCode, but test the display behavior
      const result: CommandResult = {
        status: "error",
        data: null,
        sections: [],
        error: "",
        errorCode: "EMPTY",
      };

      formatError(result);
      // Empty error message still logs the error marker
      expect(mockLog).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // handleResult
  // ==========================================================================

  describe("handleResult", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    afterEach(() => {
      mockExit.mockClear();
    });

    it("should call process.exit(1) for error results", () => {
      const result: CommandResult = {
        status: "error",
        data: null,
        sections: [],
        error: "Error occurred",
        errorCode: "ERROR",
      };

      expect(() => handleResult(result)).toThrow("process.exit called");
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should format terminal output for success results", () => {
      const result: CommandResult = {
        status: "success",
        data: {},
        sections: [{ type: "text", content: "Success!" }],
      };

      handleResult(result);
      expect(mockExit).not.toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalled();
    });
  });
});
