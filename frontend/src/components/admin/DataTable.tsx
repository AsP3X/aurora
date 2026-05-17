import type { ReactNode } from "react";
import AdminEmptyState from "./AdminEmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  className?: string;
  headerClassName?: string;
  render: (row: T) => ReactNode;
}

// Human: Responsive admin table — desktop table in flat panel; mobile stacked cards per row.
// Agent: PROPS columns data rowKey renderMobileCard; md+ table; <md card list; loading/empty slots.
export default function DataTable<T>({
  columns,
  data,
  rowKey,
  renderMobileCard,
  loading = false,
  emptyState,
  rowClassName,
  onRowContextMenu,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  renderMobileCard: (row: T) => ReactNode;
  loading?: boolean;
  emptyState?: ReactNode;
  rowClassName?: (row: T) => string;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
}) {
  const colSpan = columns.length;

  return (
  <>
      {/* Desktop table */}
      <div className="hidden md:block admin-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-950/50 text-surface-400 text-xs uppercase border-b border-white/10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-medium ${col.headerClassName ?? ""}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center">
                    <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="p-0">
                    {emptyState ?? (
                      <AdminEmptyState
                        icon={
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                        }
                        title="No rows to display"
                      />
                    )}
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={`hover:bg-white/[0.02] transition-colors ${rowClassName?.(row) ?? ""}`}
                    onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(e, row) : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="admin-panel p-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="admin-panel">
            {emptyState ?? (
              <AdminEmptyState
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                }
                title="No rows to display"
              />
            )}
          </div>
        ) : (
          data.map((row) => (
            <div key={rowKey(row)} onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(e, row) : undefined}>
              {renderMobileCard(row)}
            </div>
          ))
        )}
      </div>
    </>
  );
}
