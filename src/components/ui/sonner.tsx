import type { CSSProperties } from "react";
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// The generated component reads the active theme from `next-themes`. This app has
// no theme provider and no `.dark` class on the document — the shell is a fixed
// dark "cosmic" surface — so the theme is pinned here and the dependency dropped.
// The palette is given explicitly for the same reason: `var(--popover)` resolves
// to the light token, which would put a white toast on a dark page.
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        "--normal-bg": "oklch(0.205 0 0)",
        "--normal-text": "oklch(0.985 0 0)",
        "--normal-border": "oklch(1 0 0 / 20%)",
        "--border-radius": "var(--radius)",
      } as CSSProperties
    }
    {...props}
  />
);

export { Toaster };
