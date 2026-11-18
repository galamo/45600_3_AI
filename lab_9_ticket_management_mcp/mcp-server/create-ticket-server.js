/**
 * Creates the Ticket MCP server and registers its tools.
 *
 * Implemented:
 *   - get_ticket      : find tickets by id, title (name) or assignee
 *   - create_ticket   : create a ticket (requires dummy Authorization header)
 *
 * Prepared (stubs — not implemented yet):
 *   - close_ticket
 *   - change_ticket_status
 *   - delete_ticket
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { backend } from "./lib/backend-client.js";

// Dummy auth token — send "Authorization: Bearer dummy-ticket-token"
export const DUMMY_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "dummy-ticket-token";

const STATUSES = ["open", "in_progress", "in_review", "done", "closed"];
const statusSchema = z.enum(STATUSES).describe(`Ticket status: ${STATUSES.join(", ")}`);

// ---------- helpers ----------
function ok(structuredContent) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function fail(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function notImplemented(tool, args) {
  return fail(`${tool} is not implemented yet. Received: ${JSON.stringify(args)}`);
}

function isAuthorized(extra) {
  return extra?.authInfo?.token === DUMMY_AUTH_TOKEN;
}

/** Compact ticket shape returned to the model. */
function summarize(t) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    project: t.project?.name ?? null,
    sprint: t.sprint?.name ?? null,
    assignee: t.assignee ? { name: t.assignee.name, email: t.assignee.email } : null,
    updatedAt: t.updatedAt,
  };
}

/** Resolve a user by id, email or (partial) name. */
function findUser(users, query) {
  if (!query) return null;
  const q = query.toLowerCase();
  return (
    users.find((u) => u.id === query || u.email === q) ??
    users.find((u) => u.name.toLowerCase() === q) ??
    users.find((u) => u.name.toLowerCase().includes(q)) ??
    null
  );
}

/** Resolve a project/sprint by id or name (case-insensitive). */
function findByIdOrName(items, query) {
  if (!query) return null;
  const q = query.toLowerCase();
  return items.find((i) => i.id === query || i.name.toLowerCase() === q) ?? null;
}

function withLogging(name, handler) {
  return async (args, extra) => {
    const started = Date.now();
    console.log(`[MCP tool] → ${name}`, JSON.stringify(args ?? {}));
    try {
      const result = await handler(args, extra);
      console.log(`[MCP tool] ← ${name} ${result?.isError ? "ERROR" : "OK"} (${Date.now() - started}ms)`);
      return result;
    } catch (err) {
      console.error(`[MCP tool] ← ${name} THREW:`, err.message);
      return fail(err.message);
    }
  };
}

export function createTicketMcpServer() {
  const server = new McpServer(
    { name: "lab9-ticket-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // ---------------------------------------------------------------- get_ticket
  server.registerTool(
    "get_ticket",
    {
      title: "Get ticket",
      description:
        "Find tickets. Look up a single ticket by id, or search by title (name, partial match) and/or assignee (user name or email). At least one argument is required.",
      inputSchema: {
        id: z.number().int().positive().optional().describe("Ticket id, e.g. 3"),
        name: z.string().optional().describe("Text contained in the ticket title"),
        assignee: z.string().optional().describe("Assignee name or email"),
      },
      annotations: { readOnlyHint: true },
    },
    withLogging("get_ticket", async ({ id, name, assignee }) => {
      if (id == null && !name && !assignee) {
        return fail("Provide at least one of: id, name, assignee");
      }
      if (id != null) {
        const ticket = await backend.getTicket(id);
        return ok({ count: 1, tickets: [summarize(ticket)] });
      }
      const tickets = await backend.listTickets({ q: name, assignee });
      return ok({ count: tickets.length, tickets: tickets.map(summarize) });
    })
  );

  server.registerTool(
    "get_users",
    {
      title: "Get users",
      description:
        "Find tickets. Look up a single ticket by id, or search by title (name, partial match) and/or assignee (user name or email). At least one argument is required.",
    },
    withLogging("get_users", async ({ id, name, assignee }) => {
      const tickets = await backend.listTickets({ q: name, assignee });
      return ok({ count: tickets.length, tickets: tickets.map(summarize) });
    })
  );



  // ------------------------------------------------------------- create_ticket
  server.registerTool(
    "create_ticket",
    {
      title: "Create ticket",
      description:
        "Create a new ticket. Requires the Authorization header 'Bearer dummy-ticket-token'. Project, sprint and assignee may be given by id or name (assignee also by email).",
      inputSchema: {
        title: z.string().min(1).describe("Ticket title"),
        description: z.string().optional().describe("Ticket description"),
        project: z.string().optional().describe("Project id or name, e.g. 'Web App'"),
        sprint: z.string().optional().describe("Sprint id or name within the project, e.g. 'Sprint 1'"),
        status: statusSchema.optional().describe("Initial status (default: open)"),
        assignee: z.string().optional().describe("Assignee name, email or id"),
      },
      _meta: {
        header_authorization: {
          type: "bearer",
          description: "Send Authorization: Bearer dummy-ticket-token",
        },
      },
    },
    withLogging("create_ticket", async (args, extra) => {
      if (!isAuthorized(extra)) {
        return fail("Unauthorized. Send header 'Authorization: Bearer dummy-ticket-token'.");
      }

      const { users, projects, sprints } = await backend.meta();

      const project = findByIdOrName(projects, args.project);
      if (args.project && !project) return fail(`Unknown project: ${args.project}`);

      const projectSprints = project ? sprints.filter((s) => s.projectId === project.id) : sprints;
      const sprint = findByIdOrName(projectSprints, args.sprint);
      if (args.sprint && !sprint) return fail(`Unknown sprint "${args.sprint}"${project ? ` in project ${project.name}` : ""}`);

      const user = findUser(users, args.assignee);
      if (args.assignee && !user) return fail(`Unknown assignee: ${args.assignee}`);

      const ticket = await backend.createTicket({
        title: args.title,
        description: args.description ?? "",
        projectId: project?.id ?? sprint?.projectId ?? null,
        sprintId: sprint?.id ?? null,
        status: args.status ?? "open",
        assigneeId: user?.id ?? null,
      });
      return ok({ created: true, ticket: summarize(ticket) });
    })
  );

  // ======================================================================
  // Prepared tools — schemas are defined, handlers are NOT implemented yet.
  // ======================================================================

  // -------------------------------------------------------------- close_ticket
  server.registerTool(
    "close_ticket",
    {
      title: "Close ticket",
      description: "[NOT IMPLEMENTED] Close a ticket (sets status to 'closed').",
      inputSchema: {
        id: z.number().int().positive().describe("Ticket id to close"),
        comment: z.string().optional().describe("Optional closing comment"),
      },
    },
    withLogging("close_ticket", async (args, _extra) => {
      // TODO: implement
      //   1. (optional) require isAuthorized(extra)
      //   2. await backend.updateTicket(args.id, { status: "closed" })
      //   3. return ok({ closed: true, ticket: summarize(ticket) })
      return notImplemented("close_ticket", args);
    })
  );

  // ------------------------------------------------------ change_ticket_status
  server.registerTool(
    "change_ticket_status",
    {
      title: "Change ticket status",
      description: "[NOT IMPLEMENTED] Change the status of a ticket.",
      inputSchema: {
        id: z.number().int().positive().describe("Ticket id"),
        status: statusSchema,
      },
    },
    withLogging("change_ticket_status", async (args, _extra) => {
      // TODO: implement
      //   1. await backend.updateTicket(args.id, { status: args.status })
      //   2. return ok({ updated: true, ticket: summarize(ticket) })
      return notImplemented("change_ticket_status", args);
    })
  );

  // ------------------------------------------------------------- delete_ticket
  server.registerTool(
    "delete_ticket",
    {
      title: "Delete ticket",
      description: "[NOT IMPLEMENTED] Permanently delete a ticket.",
      inputSchema: {
        id: z.number().int().positive().describe("Ticket id to delete"),
      },
      annotations: { destructiveHint: true },
    },
    withLogging("delete_ticket", async (args, _extra) => {
      // TODO: implement
      //   1. require isAuthorized(extra) — deleting should be protected
      //   2. await backend.deleteTicket(args.id)
      //   3. return ok({ deleted: true, id: args.id })
      return notImplemented("delete_ticket", args);
    })
  );

  return server;
}
