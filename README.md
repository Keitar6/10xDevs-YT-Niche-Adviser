# YT Niche Adviser

Curate the 3–5 YouTube channels you actually compete with and get a ranked list of content opportunities — each one scored against its own channel's median views, so a breakout ranks the same whether the channel is small or large, and each with a one-line reason it made the cut.

The insight the product is built on: the value is not in automatic "niche discovery" but in **curated competitors**. A narrow, hand-picked list beats a generic algorithm on both accuracy and trust.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

3. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

4. Run the development server:

```bash
npm run dev
```

## Environment Variables

All secrets are declared in the `astro:env` schema in `astro.config.mjs` and are **server-only** — they are never exposed to the client. Put them in `.env` (Node tooling) and `.dev.vars` (Cloudflare local dev).

| Variable            | Required | Purpose                                                               |
| ------------------- | -------- | --------------------------------------------------------------------- |
| `SUPABASE_URL`      | yes      | Authentication and data storage                                       |
| `SUPABASE_KEY`      | yes      | Supabase `anon` public key                                            |
| `YOUTUBE_API_KEY`   | yes      | Resolving channels and reading video stats; analysis fails without it |
| `ANTHROPIC_API_KEY` | no       | One-line justifications; analyses still run without it                |

A banner appears in the app for any of these that is missing.

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run unit tests (vitest)
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts (shell: cosmic ground + top bar)
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ ├── lib/ # Services and helpers
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

Sign-in and sign-up happen in a dialog on the current page rather than on their own pages. The dialog is mounted once, in the top bar.

| Route                | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `/api/auth/signin`   | `POST` JSON `{ email, password }` → `{ ok: true }`                    |
| `/api/auth/signup`   | `POST` JSON `{ email, password }` → `{ ok: true, needsConfirmation }` |
| `/api/auth/signout`  | `POST`, redirects to `/`                                              |
| `/api/auth/google`   | `POST`, starts the Google OAuth redirect                              |
| `/api/auth/callback` | OAuth return point                                                    |
| `/auth/signin`       | Redirect shim → `/?auth=signin` (kept for bookmarks)                  |
| `/auth/signup`       | Redirect shim → `/?auth=signup` (kept for bookmarks)                  |
| `/dashboard`         | Protected page (bounces to `/?auth=signin&next=…` if unauthenticated) |

Any page can open the dialog: add `?auth=signin` / `?auth=signup` to the URL, or put `data-auth-open="signin"` on a button. `?auth_error=<message>` opens it showing an error — this is how OAuth failures get reported.

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set the secrets listed under [Environment Variables](#environment-variables) in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs lint + build on every push and PR to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## License

MIT
