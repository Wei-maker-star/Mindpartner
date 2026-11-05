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

Users and app records are stored in JSON files under `data/`, which is git-ignored. Sessions currently live in server memory and are lost when the process restarts. This is useful for local development only: JSON files are not a production database, do not provide reliable concurrent writes/backups, and are ephemeral on many hosting services. Before public deployment, migrate users, sessions, conversations, tasks, and submissions to a managed database and use a durable session store or a managed auth provider.

## Routes

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — account registration, password login, session check and logout.
- `POST /api/teacher/chat` — iterative teacher planning agent.
- `POST /api/teacher/outline` — one-shot outline generation.
- `POST /api/teacher/tasks`, `GET /api/teacher/tasks` — create and list the signed-in teacher's classroom tasks.
- `GET /api/student/tasks?code=...` — student joins a class activity.
- `POST /api/student/tasks/submit` — save activity choices, reflections and in-game chat.
- `GET /api/teacher/tasks/:code/submissions` — review submissions for the signed-in teacher's task.
- `POST /api/student/chat` — student companion response; a phrase-based urgent support response runs before model generation.
- `POST /api/student/companion/daily` — daily cosmetic appearance from explicit interest/activity themes, not mood or diagnosis.
- `GET` / `DELETE /api/student/memory` — restore or delete the signed-in student's private conversation.

Student conversations are stored by server-authenticated student ID and conversation ID, then sent to TokenDance for replies. Review the model provider's data handling before using real student information. The urgent phrase check is not clinical risk detection and can miss urgent situations or produce false positives.

## Recommended deployment target

Use **Tencent CloudBase** as the first platform to evaluate for this product:

- **Student app:** build/publish the native Mini Program through WeChat DevTools, initialize its CloudBase environment, and call protected backend functions. CloudBase's Mini Program flow can derive the caller identity on the server, so do not trust a student ID sent in request JSON.
- **Teacher web app:** put the static teacher portal on CloudBase Hosting.
- **Backend:** put the Node API in CloudBase CloudRun (container) to preserve the current Node server shape, or port individual routes to Cloud Functions. Keep TokenDance API credentials and the teacher invitation code in server-side secrets.
- **Database and auth:** use CloudBase PostgreSQL for user accounts, sessions, conversations, courses, task codes, submissions, consent, and audit records. Replace `data/*.json` and the in-memory `sessions` Map with PostgreSQL-backed storage before deployment. Configure database permissions so clients cannot read other students' data; authorize each request by the verified session/user and teacher-class membership.

The current student page is a responsive web prototype, not a native Mini Program yet. The app views need conversion to Mini Program WXML/WXSS/JS. The backend now has a real local account/password registration and login flow, but its JSON user store and in-memory session map are development-only; they are not suitable for a multi-instance/public deployment.

CloudBase has a Mini Program quick start and supports Node.js services, hosting, authentication, cloud functions, and PostgreSQL. Its Mini Program Growth Plan currently advertises a six-month environment/resource pack for eligible applicants; this is a time-limited offer, not a promise of permanently free hosting. Check the CloudBase console's region, quota, and current pricing before launch. TokenDance usage may be separately billed.

Before school use, add enrollment/invitation controls, class membership authorization, rate limits, audit trails, backups, deletion/retention policy, consent and a staffed safeguarding workflow. Use synthetic data until that review is complete.
