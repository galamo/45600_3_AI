/**
 * Data-access policy for the SQL agent — the single source of truth.
 *
 * It drives three independent layers of defense (defense in depth):
 *   1. sql-guard.ts      — rejects queries touching tables/columns not listed here (app level)
 *   2. db-init.ts        — generates column-level GRANTs for the agent DB role (database level)
 *   3. list_tables tool  — tells the agent exactly what it may query (prompt level)
 *
 * If the model is tricked into writing `SELECT password_hash FROM users`, layer 1 rejects it;
 * if layer 1 had a bug, layer 2 (Postgres permissions) still refuses.
 */

export interface TablePolicy {
  description: string;
  columns: Record<string, string>;
}

export const ACCESS_POLICY: Record<string, TablePolicy> = {
  users: {
    description: "SSO users",
    columns: {
      id: "PK",
      email: "login email",
      display_name: "full name",
      is_active: "boolean — false = deactivated",
      created_at: "timestamptz",
      updated_at: "timestamptz",
    },
  },
  permissions: {
    description: "Permission definitions",
    columns: { id: "PK", code: "e.g. admin_users, read_reports", name: "label", description: "text", created_at: "timestamptz" },
  },
  users_permissions: {
    description: "Junction: which user has which permission",
    columns: {
      id: "PK",
      user_id: "FK → users.id",
      permission_id: "FK → permissions.id",
      granted_at: "timestamptz",
      granted_by: "FK → users.id (nullable)",
    },
  },
  audit_login: {
    description: "Login attempts (success / failure)",
    columns: { id: "PK", user_id: "FK → users.id (nullable)", email_used: "email typed at login", success: "boolean", created_at: "timestamptz" },
  },
  resource: {
    description: "Sports resources",
    columns: { id: "PK", name: "e.g. Court 1", type: "football | tennis | basketball", created_at: "timestamptz" },
  },
  resource_booking: {
    description: "Bookings of resources by users",
    columns: {
      id: "PK",
      resource_id: "FK → resource.id",
      user_id: "FK → users.id",
      start_time: "timestamptz",
      end_time: "timestamptz",
      created_at: "timestamptz",
    },
  },
};

/** Columns that exist in the schema but must never be exposed (credentials, network PII). */
export const DENIED_COLUMNS: ReadonlySet<string> = new Set(["password_hash", "ip_address", "user_agent"]);

export const ALLOWED_TABLES: ReadonlySet<string> = new Set(Object.keys(ACCESS_POLICY));

export function isAllowedColumn(table: string | null, column: string): boolean {
  if (DENIED_COLUMNS.has(column)) return false;
  if (!table) return Object.values(ACCESS_POLICY).some((t) => column in t.columns);
  return Boolean(ACCESS_POLICY[table] && column in ACCESS_POLICY[table].columns);
}

/** Compact text description for the agent (list_tables tool). */
export function describePolicy(): string {
  return Object.entries(ACCESS_POLICY)
    .map(([table, t]) => {
      const cols = Object.entries(t.columns).map(([c, d]) => `    - ${c}: ${d}`).join("\n");
      return `${table} — ${t.description}\n${cols}`;
    })
    .join("\n\n");
}
