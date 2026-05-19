// Human: Shared KPI tile for library and stats pages.
// Agent: PRESENTATIONAL; PROPS label, value, optional sub + icon/colorClass variants.

export default function StatCard({
  label,
  value,
  sub,
  icon,
  colorClass = "bg-aurora-500/10 text-aurora-400",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  colorClass?: string;
}) {
  if (icon) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-surface-900 p-5 transition-colors hover:border-white/10">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
          <p className="text-xs font-medium uppercase tracking-wider text-surface-400">{label}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-surface-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-surface-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-surface-500">{sub}</p>}
    </div>
  );
}
