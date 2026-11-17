# Render + Supabase deployment

This project is a single Node.js web service: Render serves the teacher/student pages and `/api/*` backend from the same service. PostgreSQL stores accounts, sessions, student memory, classroom tasks, and task submissions.

## 1. Create the Supabase database

1. Create a Supabase project. Choose a region near your Render service.
2. In the Supabase dashboard, open **Connect** and select **Connection string**. Choose **Session pooler** (port **5432**) and URI format. Render Free does not support outbound IPv6, while Supabase's direct database host is IPv6 by default; the session pooler supports IPv4. This Node server is a long-running service, so Session mode is suitable.
3. Copy the complete URI. It should look like `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@<pooler-host>:5432/postgres`. Replace only `[YOUR-PASSWORD]` with the database password you set for the Supabase project. If the password contains reserved URL characters, percent-encode them (for example `@` becomes `%40`, `#` becomes `%23`, `/` becomes `%2F`). Do not add a second URI or repeat `postgres:`; the value must be one complete connection URI.
4. In **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql) once. This creates the tables the backend expects.
5. Keep the connection URI private. Never put it in `index.html`, `app.js`, GitHub, or a message. If you already shared a real database password/URI publicly, reset the database password before continuing.

## 2. Push the project to GitHub

Create a private repository and push this project folder. Include `package.json`, `package-lock.json`, `server.js`, `index.html`, `app.js`, `.gitignore`, `.env.example`, and `supabase/schema.sql`. Do not commit `.env`, `node_modules/`, `.npm-cache/`, or `data/`.

## 3. Create the Render web service

1. In Render, select **New → Web Service** and connect the GitHub repository.
2. Set **Root Directory** to `outputs/xinban-prototype` if that is where `package.json` lives in the repository. If the repository root is this project folder, leave it blank.
3. Use **Node**; set Build Command to `npm install` and Start Command to `npm start`.
4. Select the Free instance. Set health check path to `/api/health` if Render shows that setting.
5. Create the service. The server reads Render's `PORT` and binds to `0.0.0.0`.

## 4. Add Render environment variables

In the Render service page, open **Environment** → **Add Environment Variable** and add:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | The complete Supabase **Session pooler** URI copied above, with the password filled in |
| `TOKENDANCE_API_KEY` | Your TokenDance API key |
| `TOKENDANCE_BASE_URL` | `https://tokendance.space/gateway/v1` |
| `TOKENDANCE_MODEL` | The exact model ID from TokenDance, such as your configured model |
| `TEACHER_SIGNUP_CODE` | A long private invitation code for teacher registration |
| `NODE_ENV` | `production` |

Do not set `PORT`; Render supplies it. Save changes and redeploy. When deployment finishes, open `https://<service-name>.onrender.com/api/health`. `databaseReady` should be `true`; if it is `false`, confirm the connection string, network mode, and that `schema.sql` ran successfully.

## What this database currently stores

- `app_users`: teacher/student accounts and password hashes.
- `app_sessions`: hashes of login session tokens and expiry.
- `student_memory`: student conversation and activity memory JSON.
- `classroom_tasks`: teacher tasks plus student submissions/actions/chat in JSON.
- `teacher_resources`: teacher Agent conversations and saved preparation materials, scoped to the owning teacher account.

When `DATABASE_URL` is configured, these records use Supabase. If it is missing, the app falls back to local JSON for development; Render's filesystem is ephemeral, so do not use that mode for deployed data. Existing local JSON demo data is not automatically imported into Supabase; the database starts empty.

## Free-tier limits

Render Free web services sleep after inactivity and use ephemeral storage. Supabase Free has database-size and inactivity limits. These are suitable for a prototype with synthetic data, not a guarantee of uptime, backups, or safe long-term storage. Check current limits in [Render's free instance docs](https://render.com/docs/free), [Supabase billing docs](https://supabase.com/docs/guides/platform/billing-on-supabase), and [Supabase pause policy](https://supabase.com/docs/guides/platform/free-project-pausing).

Before inviting real students, have the school review consent, safeguarding and escalation procedures, data retention/deletion, access controls, backups, and the TokenDance data handling terms. The app's keyword check is only a basic demo safeguard, not clinical risk detection. Use synthetic data during initial testing.
