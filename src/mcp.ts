/**
 * evalsnap MCP server. Tools: diff_snapshots.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The diff is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { diffSnapshots, formatPayload, VERSION } from "./evalsnap.js";

const TOOLS = [
  {
    name: "diff_snapshots",
    description:
      "Diff two eval snapshots matched by case_id: changed and unchanged cases, score and duration deltas, regressions, average scores over matched scored cases, and a pass/fail verdict.",
    inputSchema: {
      type: "object" as const,
      properties: {
        baseline: {
          type: "array",
          description: "Baseline snapshot entries (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              case_id: {
                type: "string",
                description: "Case identifier, unique within this side",
              },
              output: {
                type: "string",
                description: "Output produced for the case",
              },
              score: {
                type: "number",
                description: "Score for the case (optional)",
              },
              duration_ms: {
                type: "number",
                description: "Duration in milliseconds (optional)",
                minimum: 0,
              },
            },
            required: ["case_id", "output"],
          },
        },
        current: {
          type: "array",
          description: "Current snapshot entries (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              case_id: {
                type: "string",
                description: "Case identifier, unique within this side",
              },
              output: {
                type: "string",
                description: "Output produced for the case",
              },
              score: {
                type: "number",
                description: "Score for the case (optional)",
              },
              duration_ms: {
                type: "number",
                description: "Duration in milliseconds (optional)",
                minimum: 0,
              },
            },
            required: ["case_id", "output"],
          },
        },
      },
      required: ["baseline", "current"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "evalsnap", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "diff_snapshots") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = diffSnapshots(raw.baseline, raw.current);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
