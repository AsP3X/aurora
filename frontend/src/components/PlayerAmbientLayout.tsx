// Human: Full-viewport login-style aurora behind the immersive `/player/:id` page (meteors + focus scrim).
// Agent: WRAPS children; MOUNTS NetworkBackground variant=auth; OPTIONAL focusTargetRef for stage highlight.
import { type RefObject, type ReactNode } from "react";
import NetworkBackground from "./NetworkBackground";

export default function PlayerAmbientLayout({
  children,
  focusTargetRef,
}: {
  children: ReactNode;
  focusTargetRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-surface-950">
      <NetworkBackground variant="auth" focusTargetRef={focusTargetRef} />
      <div className="relative z-10 flex min-h-dvh flex-1 flex-col">{children}</div>
    </div>
  );
}
