// Human: Session flag so SetupGuard can signal Library to show a post-setup welcome toast after redirect.
// Agent: sessionStorage key aurora:setup-complete-toast; mark WRITES; consume READS+REMOVES once.

const SETUP_COMPLETE_TOAST_KEY = "aurora:setup-complete-toast";

// Human: Called when setup finishes and the user is sent to the library — survives the route change.
// Agent: WRITES sessionStorage flag; NO auth dependency; consumed once on Library mount.
export function markSetupCompleteForToast(): void {
  try {
    sessionStorage.setItem(SETUP_COMPLETE_TOAST_KEY, "1");
  } catch {
    // Human: Private browsing or blocked storage should not break navigation.
    // Agent: SWALLOW storage errors; caller proceeds without toast.
  }
}

// Human: Returns true the first time Library loads after setup, then clears the flag.
// Agent: READS+REMOVES sessionStorage; RETURNS boolean pending state.
export function consumeSetupCompleteToast(): boolean {
  try {
    if (sessionStorage.getItem(SETUP_COMPLETE_TOAST_KEY) !== "1") {
      return false;
    }
    sessionStorage.removeItem(SETUP_COMPLETE_TOAST_KEY);
    return true;
  } catch {
    return false;
  }
}
