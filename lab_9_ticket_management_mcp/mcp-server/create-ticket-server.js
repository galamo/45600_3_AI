/**
 * Creates the Ticket MCP server and registers its tools.
 *
 * Access is role based (role comes from the JWT issued by POST /auth):
 *   viewer + admin:
 *     - get_ticket      : find tickets by id, title (name) or assignee
 *     - get_users       : list users that can be assigned to tickets
 *   admin only:
 *     - create_ticket         : create a ticket
 *     - delete_ticket         : delete a ticket
 *     - close_ticket          : set status to closed
 *     - change_ticket_status  : set status to any allowed value
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { backend } from "./lib/backend-client.js";
import { ROLES } from "./lib/auth.js";

const READ_ROLES = [ROLES.ADMIN, ROLES.VIEWER];
const WRITE_ROLES = [ROLES.ADMIN];

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

/** authInfo is rebuilt from the JWT on every request, so the session id alone grants nothing. */
function roleOf(extra) {
  return extra?.authInfo?.extra?.role;
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

function withRole(name, allowedRoles, handler) {
  return withLogging(name, async (args, extra) => {
    const role = roleOf(extra);
    if (!allowedRoles.includes(role)) {
      return fail(`Forbidden: ${name} requires role ${allowedRoles.join(" or ")} (got ${role ?? "none"}).`);
    }
    return handler(args, extra);
  });
}

/**
 * @param {{ role?: string }} options
 *   role — role from the JWT the session was opened with; controls which tools are exposed.
 */
export function createTicketMcpServer({ role } = {}) {
  const server = new McpServer(
    { name: "lab9-ticket-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  const canRead = READ_ROLES.includes(role);
  const canWrite = WRITE_ROLES.includes(role);

  if (!canRead) return server;

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
    withRole("get_ticket", READ_ROLES, async ({ id, name, assignee }) => {
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

  // ----------------------------------------------------------------- get_users
  server.registerTool(
    "get_users",
    {
      title: "Get users",
      description:
        "List all users that can be assigned to a ticket. Optionally filter by name or email (partial, case-insensitive). Use the returned name, email or id as the 'assignee' in create_ticket.",
      inputSchema: {
        query: z.string().optional().describe("Optional text contained in the user's name or email"),
      },
      annotations: { readOnlyHint: true },
    },
    withRole("get_users", READ_ROLES, async ({ query }) => {
      const { users } = await backend.meta();
      const q = query?.toLowerCase();
      const matches = q
        ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        : users;
      return ok({
        count: matches.length,
        users: matches.map((u) => ({ id: u.id, name: u.name, email: u.email })),
      });
    })
  );

  // ======================================================================
  // Admin-only tools
  // ======================================================================
  if (!canWrite) return server;

  // ------------------------------------------------------------- create_ticket
  server.registerTool(
    "create_ticket",
    {
      title: "Create ticket",
      description:
        "Create a new ticket. Project, sprint and assignee may be given by id or name (assignee also by email).",
      inputSchema: {
        title: z.string().min(1).describe("Ticket title"),
        description: z.string().optional().describe("Ticket description"),
        project: z.string().optional().describe("Project id or name, e.g. 'Web App'"),
        sprint: z.string().optional().describe("Sprint id or name within the project, e.g. 'Sprint 1'"),
        status: statusSchema.optional().describe("Initial status (default: open)"),
        assignee: z.string().optional().describe("Assignee name, email or id"),
      },
    },
    withRole("create_ticket", WRITE_ROLES, async (args) => {
      const { users, projects, sprints } = await backend.meta();
      const checkUserRole = true;
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

  // -------------------------------------------------------------- close_ticket
  server.registerTool(
    "close_ticket",
    {
      title: "Close ticket",
      description: "Close a ticket (sets status to 'closed').",
      inputSchema: {
        id: z.number().int().positive().describe("Ticket id to close"),
        comment: z.string().optional().describe("Optional closing comment"),
      },
    },
    withRole("close_ticket", WRITE_ROLES, async (args, _extra) => {
      const ticket = await backend.updateTicket(args.id, { status: "closed" });
      return ok({ closed: true, ticket: summarize(ticket), comment: args.comment ?? null });
    })
  );

  // ------------------------------------------------------ change_ticket_status
  server.registerTool(
    "change_ticket_status",
    {
      title: "Change ticket status",
      description: "Change the status of a ticket.",
      inputSchema: {
        id: z.number().int().positive().describe("Ticket id"),
        status: statusSchema,
      },
    },
    withRole("change_ticket_status", WRITE_ROLES, async (args, _extra) => {
      const ticket = await backend.updateTicket(args.id, { status: args.status });
      return ok({ updated: true, ticket: summarize(ticket) });
    })
  );

  // ------------------------------------------------------------- delete_ticket
  server.registerTool(
    "delete_ticket",
    {
      title: "Delete ticket",
      description: "Permanently delete a ticket.",
      inputSchema: {
        id: z.number().int().positive().describe("Ticket id to delete"),
      },
      annotations: { destructiveHint: true },
    },
    withRole("delete_ticket", WRITE_ROLES, async ({ id }) => {
      await backend.deleteTicket(id);
      return ok({ deleted: true, id });
    })
  );

  return server;
}
