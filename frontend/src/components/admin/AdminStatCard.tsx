// Human: Dashboard metric tile — colored icon well, bold value, uppercase label on a flat card.
// Agent: PRESENTATIONAL; PROPS label value icon colorClass; USES admin-panel flat card.
export default function AdminStatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="admin-panel p-5 flex items-center gap-4 hover:border-white/10 transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
        <p className="text-xs text-surface-400 uppercase tracking-wider font-medium">{label}</p>
      </div>
    </div>
  );
}
