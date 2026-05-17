import type { ReactNode } from "react";

// Human: Primary flat card for admin sections — optional title header and subtle hover border.
// Agent: PROPS title children className padding hover; APPLIES admin-panel + p-5|p-6.
export default function AdminGlassCard({
  title,
  children,
  className = "",
  padding = "md",
  hover = false,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  padding?: "md" | "lg";
  hover?: boolean;
}) {
  const pad = padding === "lg" ? "p-6" : "p-5";
  return (
    <div
      className={`admin-panel ${pad} ${
        hover ? "hover:border-white/10 transition-colors duration-200" : ""
      } ${className}`}
    >
      {title && (
        <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}

