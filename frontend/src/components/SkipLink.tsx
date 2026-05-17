// Human: First-tab stop that jumps past chrome straight to the page’s primary content.
// Agent: RENDERS anchor to #main-content; sr-only until :focus; z-[100] for visibility above headers.

type SkipLinkProps = {
  /** Human: Override when the main landmark uses a different id (rare). */
  /** Agent: DEFAULT #main-content href target. */
  targetId?: string;
  label?: string;
};

export default function SkipLink({
  targetId = "main-content",
  label = "Skip to main content",
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-aurora-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-aurora-400 focus:ring-offset-2 focus:ring-offset-surface-950"
    >
      {label}
    </a>
  );
}
