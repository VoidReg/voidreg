export type SignInProvider = "google" | "github";
export type ProviderIntent = "signin" | "continue";

export function isSignInProvider(value: string): value is SignInProvider {
  return value === "google" || value === "github";
}

/** Approved call-to-action. "Sign in with …" starts a session; "Continue with …" connects another account. */
export function providerButtonLabel(
  provider: SignInProvider,
  intent: ProviderIntent,
): string {
  const name = provider === "google" ? "Google" : "GitHub";
  return intent === "continue"
    ? `Continue with ${name}`
    : `Sign in with ${name}`;
}
