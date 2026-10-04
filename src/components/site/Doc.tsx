import type { ReactNode } from "react";

export function DocHeader({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header>
      <p className="doc-eyebrow">{eyebrow}</p>
      <h1 className="doc-title">{title}</h1>
      {lead ? <p className="doc-lead">{lead}</p> : null}
      {children}
    </header>
  );
}

export function DocSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} className="doc-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`} role="note">
      {title ? <strong>{title} </strong> : null}
      {children}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone?: "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return <span className={`pill${tone ? ` pill-${tone}` : ""}`}>{children}</span>;
}

export type Column<Row> = {
  header: string;
  render: (row: Row) => ReactNode;
  /** Render the cell as a row header for assistive technology. */
  rowHeader?: boolean;
};

/**
 * Accessible data table: caption, column headers with scope, a keyboard-focusable
 * scroll region so wide tables stay usable on narrow screens.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
}) {
  return (
    <div className="doc-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="doc-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) =>
                column.rowHeader ? (
                  <th key={column.header} scope="row">
                    {column.render(row)}
                  </th>
                ) : (
                  <td key={column.header}>{column.render(row)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
