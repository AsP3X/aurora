// Human: Secondary admin control — pagination and toolbar actions on flat surface buttons.
// Agent: PROPS children disabled onClick className; BUTTON surface-800 compact hover.
export default function GlassButton({
  children,
  disabled,
  onClick,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 bg-surface-800 hover:bg-surface-700 border border-white/5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-aurora-500/50 ${className}`}
    >
      {children}
    </button>
  );
}
