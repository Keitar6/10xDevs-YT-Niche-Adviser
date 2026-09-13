interface Props {
  next?: string;
}

/**
 * TSX twin of the former GoogleSignInButton.astro — an .astro component cannot
 * render inside a React island, and the dialog needs one.
 *
 * This is the one form in the auth flow that should navigate: the trip to
 * Google's consent screen is a full-page redirect no matter what, so a native
 * POST is correct here even inside a dialog.
 */
export default function GoogleSignInButton({ next = "/" }: Props) {
  return (
    <form method="POST" action="/api/auth/google">
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
      >
        <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.52 5.52 0 0 1-2.4 3.63v3.02h3.86c2.26-2.09 3.59-5.17 3.59-8.89Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.84l-3.86-3.02c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.12A11.99 11.99 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.33A7.2 7.2 0 0 1 4.89 12c0-.81.14-1.6.38-2.33V6.55H1.28A11.99 11.99 0 0 0 0 12c0 1.93.46 3.76 1.28 5.45l3.99-3.12Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.28 6.55l3.99 3.12C6.22 6.86 8.87 4.75 12 4.75Z"
          />
        </svg>
        Continue with Google
      </button>
    </form>
  );
}
