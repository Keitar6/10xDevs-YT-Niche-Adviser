import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SignInForm from "@/components/auth/SignInForm";
import SignUpForm from "@/components/auth/SignUpForm";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { safeNextPath } from "@/lib/services/safe-next";

type Mode = "signin" | "signup" | "confirm";

const TITLES: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Sign up",
  confirm: "Check your email",
};

interface State {
  open: boolean;
  mode: Mode;
  error: string | null;
  /** Where an in-dialog sign-in lands. */
  returnPath: string;
}

interface Props {
  /** Default return path, supplied server-side by Topbar. A `next` query param
   *  (set by the middleware bounce) overrides it on mount. */
  next?: string;
}

/**
 * Reads the auth query params the rest of the slice writes: `?auth=` opens the
 * dialog in a mode, `?auth_error=` opens it carrying a message (the read point
 * that replaced the old `?error=` channel), `?next=` says where to land.
 *
 * Returns the state they imply plus the cleaned URL, or null when there is
 * nothing to consume.
 */
function consumeAuthParams(search: string, pathname: string, hash: string, fallbackNext: string) {
  const params = new URLSearchParams(search);
  const auth = params.get("auth");
  const authError = params.get("auth_error");
  const urlNext = params.get("next");

  if (auth === null && authError === null && urlNext === null) return null;

  params.delete("auth");
  params.delete("auth_error");
  params.delete("next");
  const query = params.toString();

  return {
    state: {
      open: authError !== null || auth === "signin" || auth === "signup",
      mode: (auth === "signup" ? "signup" : "signin") as Mode,
      error: authError,
      returnPath: urlNext === null ? fallbackNext : safeNextPath(urlNext),
    },
    cleanUrl: `${pathname}${query ? `?${query}` : ""}${hash}`,
  };
}

export default function AuthDialog({ next = "/" }: Props) {
  const [state, setState] = useState<State>({ open: false, mode: "signin", error: null, returnPath: next });

  // The URL is an external system this component can only read after
  // hydration — reading it during render would diverge from the server output.
  // This is a one-shot read-and-strip at mount, not a render-derived value:
  // left in place, the params silently reopen the dialog on every refresh or
  // back-navigation, replaying an error that has outlived its cause.
  useEffect(() => {
    const consumed = consumeAuthParams(window.location.search, window.location.pathname, window.location.hash, next);
    if (!consumed) return;

    // A single one-shot sync from the URL at mount, deliberately not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- justified above
    setState(consumed.state);
    window.history.replaceState(null, "", consumed.cleanUrl);
  }, [next]);

  // Astro markup cannot call into a React island, so any element on the page
  // opts in with data-auth-open="signin|signup" and this delegated listener
  // picks it up — no inline scripts, no duplicated dialog state.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest("[data-auth-open]");
      if (!trigger) return;

      event.preventDefault();
      const mode: Mode = trigger.getAttribute("data-auth-open") === "signup" ? "signup" : "signin";
      setState((prev) => ({ ...prev, open: true, mode, error: null }));
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  function switchMode(mode: Mode) {
    setState((prev) => ({ ...prev, mode, error: null }));
  }

  // Topbar reads Astro.locals.user server-side, so the Set-Cookie from a
  // fetch-based sign-in lands but nothing re-renders the shell. A real
  // navigation is the honest answer; assigning the current path reloads it.
  function completeSignIn() {
    window.location.assign(state.returnPath);
  }

  return (
    <Dialog
      open={state.open}
      onOpenChange={(isOpen) => {
        setState((prev) => (isOpen ? { ...prev, open: true } : { ...prev, open: false, mode: "signin", error: null }));
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="text-purple-300 transition-colors hover:text-purple-100 hover:underline">
          Sign in
        </button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-white/10 text-white backdrop-blur-xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-center text-2xl font-bold text-transparent">
            {TITLES[state.mode]}
          </DialogTitle>
        </DialogHeader>

        {state.mode === "confirm" ? (
          <div className="text-center">
            <div className="mb-4 text-5xl">📧</div>
            <p className="mb-6 text-blue-100/80">
              We&apos;ve sent a confirmation link to your email address. Click it to activate your account.
            </p>
            <button
              type="button"
              onClick={() => {
                switchMode("signin");
              }}
              className="text-sm text-purple-300 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <GoogleSignInButton next={state.returnPath} />
            <div className="flex items-center gap-3 text-xs text-blue-100/40">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            {state.mode === "signin" ? (
              <SignInForm initialError={state.error} onSuccess={completeSignIn} />
            ) : (
              <SignUpForm
                initialError={state.error}
                onSuccess={(needsConfirmation) => {
                  if (needsConfirmation) {
                    setState((prev) => ({ ...prev, mode: "confirm", error: null }));
                  } else {
                    completeSignIn();
                  }
                }}
              />
            )}

            <p className="text-center text-sm text-blue-100/60">
              {state.mode === "signin" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      switchMode("signup");
                    }}
                    className="text-purple-300 hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      switchMode("signin");
                    }}
                    className="text-purple-300 hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
