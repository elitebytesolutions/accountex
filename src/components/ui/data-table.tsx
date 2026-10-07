"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { EmptyState, ErrorState, Skeleton } from "./states";

export type Column<T> = {
  key: string;
  header: string;
  /** Right-aligned numeric column (template `th.num`). */
  num?: boolean;
  /** Server-side sort field; clicking the header toggles asc/desc. */
  sortable?: boolean;
  render: (row: T) => ReactNode;
};

/** `sort` uses the ListQuery convention: "field" ascending, "-field" descending. */
export function DataTable<T>({ columns, rows, rowKey, total, page, pageSize, sort, onSortChange, onPageChange, loading, error, onRetry, empty, onRowClick }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  onSortChange?: (sort: string) => void;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  error?: { message: string; reference?: string };
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (error) return <div style={{ padding: 16 }}><ErrorState message={error.message} reference={error.reference} onRetry={onRetry} /></div>;

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const sortIcon = (key: string) =>
    sort === key ? <ArrowUp /> : sort === `-${key}` ? <ArrowDown /> : <ArrowUpDown />;
  const toggle = (key: string) => onSortChange?.(sort === key ? `-${key}` : key);

  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(c.num && "num", c.sortable && "sortable", c.sortable && sort?.replace("-", "") === c.key && "sorted")}
                  onClick={c.sortable ? () => toggle(c.key) : undefined}
                  aria-sort={sort === c.key ? "ascending" : sort === `-${c.key}` ? "descending" : undefined}
                >
                  {c.header}
                  {c.sortable && <span className="sort-ic">{sortIcon(c.key)}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn(c.num && "num")}>
                        <Skeleton style={{ height: 10, width: c.num ? 80 : "70%", marginLeft: c.num ? "auto" : undefined }} />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: "pointer" } : undefined}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn(c.num && "num")}>{c.render(row)}</td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && (empty ?? <EmptyState icon={<SearchX />} tone="blue" title="Nothing here yet" description="No records match. Try clearing the search or filters." />)}
      {total > 0 && (
        <div className="table-foot">
          <span>Showing {from}–{to} of {total}</span>
          {pages > 1 && (
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} aria-label="Previous page">‹</button>
              {pageNumbers(page, pages).map((n, i) =>
                n === null ? <button key={`gap${i}`} type="button" disabled>…</button> : (
                  <button key={n} type="button" className={cn(n === page && "active")} onClick={() => onPageChange?.(n)}>{n}</button>
                ),
              )}
              <button type="button" disabled={page >= pages} onClick={() => onPageChange?.(page + 1)} aria-label="Next page">›</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** 1 … 4 5 6 … 20 */
function pageNumbers(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | null)[] = [];
  [...keep].sort((a, b) => a - b).forEach((n, i, all) => {
    if (i && n - all[i - 1]! > 1) out.push(null);
    out.push(n);
  });
  return out;
}
