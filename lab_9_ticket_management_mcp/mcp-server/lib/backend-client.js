/**
 * Thin HTTP client for the ticket backend REST API.
 * The MCP server owns no data — everything is read/written through the backend.
 */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Backend ${method} ${path} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const backend = {
  meta: () => request("/meta"),
  getTicket: (id) => request(`/tickets/${encodeURIComponent(id)}`),
  listTickets: (filters = {}) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v != null && v !== "")
    );
    return request(`/tickets?${params}`);
  },
  createTicket: (body) => request("/tickets", { method: "POST", body }),
  updateTicket: (id, body) => request(`/tickets/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteTicket: (id) => request(`/tickets/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export { BACKEND_URL };
