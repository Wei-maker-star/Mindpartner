# 心伴 prototype backend

This local Node.js backend connects the prototype to TokenDance's OpenAI-compatible Chat Completions endpoint. The browser never receives the provider API key.

Teacher agent persona: experienced school mental health educator. Student agent persona: psychology-informed, friendly companion. Student replies allow up to 2,400 tokens and teacher responses up to 4,600 tokens per segment; the backend requests continuation if the provider reports a length cutoff.

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env`.
3. Set `TOKENDANCE_API_KEY` and the exact model ID shown in your TokenDance dashboard. Keep `.env` private; it is ignored by Git.
4. Set `TEACHER_SIGNUP_CODE` to a private invite code before creating teacher accounts.
5. In this folder run `npm start`, then open `http://127.0.0.1:8787`.

## Accounts and storage in this prototype

The login page supports separate teacher/student registration and password login. Passwords are stored as scrypt hashes (random salt); the server issues a seven-day HttpOnly, SameSite cookie. A teacher invite code is required to register a teacher; set `TEACHER_SIGNUP_CODE` in `.env`. API routes check login and role, and teacher task lists are scoped to their account.

For local development without `DATABASE_URL`, users, app records, and sessions are stored in JSON files under `data/`, which is git-ignored. For deployment with `DATABASE_URL`, the app uses Supabase Postgres for accounts, hashed sessions, student memory, classroom tasks, and submissions. Render's filesystem is ephemeral, so configure the database before deploying. Existing local JSON demo data is not automatically imported.

The activity library lives in the tracked `data/game-catalog.json` file. It contains 63 classroom activity designs; student-facing steps are assembled by activity type, and teachers can preview, revise with the agent, publish a versioned class task, or export step-by-step `.pptx` slides. Drawing activities have an in-browser canvas with PNG download. A teacher can revise an activity through iterative natural-language chat; after each successful edit, the current version and up to three prior versions are saved to their resource library. In classroom management, “按反馈改游戏” reopens the published snapshot with anonymized participation, completion, skipped-step, time and choice-count summaries. Raw student names, chat and free-text reflections are not sent to the agent for this tuning flow. Classroom progress saves after each completed step and in-game exchange; final submission updates the same record. Self-started practice records stay in the student's private memory.

The student companion also uses a small, tracked Chinese-language positive psychology reference set in `data/positive-psychology-kb.json`. Each chat turn gets up to three locally keyword-matched notes (for example PERMA, strengths, self-compassion, hope, gratitude, relationships and evidence boundaries) in the hidden system context; the knowledge file is not exposed as a public route. Matching is guidance for optional, non-diagnostic educational conversation, not a clinical assessment or a claim that an exercise will work for everyone. Relevant Chinese messages can also select only student-autonomous games; teacher-led group games are excluded from private recommendations. The safety check still runs before model generation.

Game recommendations are gated separately from keyword matching. A candidate list alone never triggers a card: the student must have described a clear concern in the recent four student turns, asked for an exercise, said they do not want to talk, or expressed dissatisfaction with the companion's previous reply. A bare topic word (such as “exam” or “classmate”) is not enough. Recommendations are only shown in private chat; the model can return no recommendation. Automatic suggestions are capped at two per conversation, and the same game ID is never suggested twice in that conversation. The default gap is three intervening student turns. A student's private `gamePreferences` summary records only recommended game IDs and timestamps for shown, started, skipped and completed games. After two consecutive skips, or a skip rate of at least 60% across three or more decided recommendations, the gap grows to six intervening turns. After three consecutive starts/completions with no skips, it shortens to two intervening turns. Otherwise it stays at three. An explicit request for an activity can bypass the wait and automatic cap, but not the duplicate-game block. The frontend gives each card both “start” and “skip” actions; finishing a recommended practice records completion. Safety escalation still disables recommendations. No preference event stores free-text chat.

## Routes

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — account registration, password login, session check and logout.
- `POST /api/teacher/chat` — iterative teacher planning agent.
- `POST /api/teacher/outline` — one-shot outline generation.
- `POST /api/teacher/tasks`, `GET /api/teacher/tasks` — create and list the signed-in teacher's classroom tasks.
- `GET /api/student/tasks?code=...` — student joins a class activity.
- `POST /api/student/tasks/progress`, `POST /api/student/tasks/submit` — incrementally save and finalize activity choices, reflections and in-game chat under the same classroom record.
- `POST /api/student/practices/complete` — save an opted-in student's self-started activity and update their private practice progress.
- `GET /api/teacher/tasks/:code/submissions` — review submissions for the signed-in teacher's task.
- `GET /api/teacher/tasks/:code/insights` — return anonymous class-level activity metrics for game tuning.
- `POST /api/teacher/game-edit` — revise the game using teacher chat history and optional anonymous class metrics.
- `POST /api/student/chat` — student companion response; a phrase-based urgent support response runs before model generation.
- `POST /api/student/companion/daily` — daily cosmetic appearance from explicit interest/activity themes, not mood or diagnosis.
- `GET` / `DELETE /api/student/memory` — restore or delete the signed-in student's private conversation.

Student conversations are stored by server-authenticated student ID and conversation ID, then sent to TokenDance for replies. Review the model provider's data handling before using real student information. The urgent phrase check is not clinical risk detection and can miss urgent situations or produce false positives.

## Web deployment direction (Render + Supabase)

For a free web demo, use one **Render Web Service** for both the frontend and Node API; `server.js` serves `index.html` and `app.js` from the same origin. Put account and activity data in **Supabase Postgres** by setting `DATABASE_URL` to the Supabase Session Pooler URI (port 5432) and running `supabase/schema.sql` once in Supabase SQL Editor. Do not publish real student records during the prototype stage.

If the Supabase tables already exist, run the updated `supabase/schema.sql` again so it can add the `classroom_tasks.game_definition` column used to keep each published activity's exact steps.

See [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) for the dashboard settings, environment variables, and database setup. Render free services sleep after 15 minutes idle; Render's own free Postgres expires after 30 days. Supabase Free currently has a 500 MB database allowance and can pause inactive projects. These are prototype limits, not an uptime guarantee.

Keep TokenDance and database credentials in Render's environment settings. Before school use, add enrollment controls, class membership authorization, request limits, audit trails, backups, deletion/retention policy, consent and a staffed safeguarding workflow. Use synthetic data until that review is complete.
