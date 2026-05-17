import type { ReactNode } from "react";

// Human: Consistent admin page title row — optional subtitle and right-aligned error pill.
// Agent: PROPS title subtitle error children; LAYOUT flex-col sm:flex-row; ERROR pill red glass-adjacent.
export default function PageHeader({
  title,
  subtitle,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-surface-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        {error && (
          <div
            role="alert"
            className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
          >
            {error}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
