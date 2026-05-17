import type { ReactNode } from "react";
import AdminGlassCard from "./AdminGlassCard";

// Human: Standard mobile table row — leading slot, primary/secondary text, trailing actions/pills.
// Agent: PROPS leading primary secondary trailing; WRAPS AdminGlassCard compact padding.
export default function MobileDataCard({
  leading,
  primary,
  secondary,
  trailing,
}: {
  leading?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <AdminGlassCard padding="md" hover className="!p-4">
      <div className="flex items-center gap-3">
        {leading}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{primary}</p>
          {secondary && (
            <p className="text-xs text-surface-400 truncate">{secondary}</p>
          )}
        </div>
        {trailing}
      </div>
    </AdminGlassCard>
  );
}
