const MAX_VISIBLE = 50;

const cell = (v: unknown) =>
  v === null || v === undefined ? <span className="null">null</span>
  : typeof v === "boolean" ? <span className={`bool ${v}`}>{String(v)}</span>
  : typeof v === "object" ? JSON.stringify(v)
  : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? new Date(String(v)).toLocaleString()
  : String(v);

export function ResultsTable({ columns, rows, truncated }: { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean }) {
  if (!rows.length) return <p className="muted small">No rows.</p>;
  const visible = rows.slice(0, MAX_VISIBLE);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i}>{columns.map((c) => <td key={c}>{cell(r[c])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rows.length > MAX_VISIBLE || truncated) && (
        <p className="muted small">
          Showing {visible.length} of {rows.length}{truncated ? "+ (capped by the server row limit)" : ""} rows.
        </p>
      )}
    </>
  );
}
