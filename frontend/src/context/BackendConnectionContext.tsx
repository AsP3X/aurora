import { createContext, useContext } from "react";

// Human: Signals that the initial setup-status probe could not reach the API — login shows a banner instead of setup.
// Agent: CONTEXT backendUnreachable + retryConnectionCheck; CONSUMED by Login; PROVIDED by SetupGuard.

type BackendConnectionContextValue = {
  backendUnreachable: boolean;
  retryConnectionCheck: () => void;
};

const BackendConnectionContext = createContext<BackendConnectionContextValue>({
  backendUnreachable: false,
  retryConnectionCheck: () => {},
});

export function BackendConnectionProvider({
  value,
  children,
}: {
  value: BackendConnectionContextValue;
  children: React.ReactNode;
}) {
  return (
    <BackendConnectionContext.Provider value={value}>
      {children}
    </BackendConnectionContext.Provider>
  );
}

export function useBackendConnection() {
  return useContext(BackendConnectionContext);
}
