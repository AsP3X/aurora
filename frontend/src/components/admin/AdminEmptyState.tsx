import type { ReactNode } from "react";

// Human: Centered empty table/list state — icon tile, title, optional subtitle (no illustration per Aurora rules).
// Agent: PROPS icon title subtitle; CENTERED flex column; ICON tile surface-900 border.
export default function AdminEmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-900 border border-white/5 flex items-center justify-center text-surface-400 mb-4">
        {icon}
      </div>
      <p className="text-surface-400 font-medium">{title}</p>
      {subtitle && <p className="text-surface-500 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}
