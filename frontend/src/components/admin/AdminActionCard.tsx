// Human: Quick-action tile on overview — icon + label on a flat nested surface.
// Agent: PROPS icon label onClick; BUTTON; surface-800/50 hover border brighten.
export default function AdminActionCard({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 bg-surface-800/50 border border-white/5 rounded-xl hover:border-white/10 hover:bg-surface-800 transition-all focus:outline-none focus:ring-2 focus:ring-aurora-500/50"
    >
      <span className="text-aurora-400">{icon}</span>
      <span className="text-sm font-medium text-white">{label}</span>
    </button>
  );
}
