## Goal (Phase 1)
Telegram bot in Uzbek: students upload homework with name + group → submission stored as "pending" → parents group for that class is notified → teachers review (AI drafts grade + feedback, teacher approves/edits via inline buttons) → student and parents are notified of the result.

All bot commands and messages are in Uzbek.

## Architecture

- **Runtime**: TanStack Start server route (TypeScript), no Python.
- **Telegram**: Lovable Telegram connector → all calls go through the connector gateway. No raw bot token in code.
- **DB**: Lovable Cloud (Postgres) for submissions, students, group bindings, teacher/admin registry.
- **AI**: Lovable AI Gateway via AI SDK (`google/gemini-3-flash-preview`) for draft homework feedback (handles photos and PDFs/docs).
- **Webhook**: single public route `/api/public/telegram/webhook` verifying the derived secret token. It's a state machine driven by `chat_id` + per-user state stored in DB.

```text
Student DM ──/start ──▶ asks name ──▶ asks group ──▶ asks file
                                                       │
                                                       ▼
                                          DB: submissions(status=pending)
                                                       │
                                ┌──────────────────────┼─────────────────────────┐
                                ▼                      ▼                         ▼
                       Parents group(s)         Teachers chat              AI draft review
                       "yangi vazifa"           file + inline buttons      (grade + notes)
                                                       │
                                          Teacher taps grade / edits
                                                       │
                                ┌──────────────────────┴─────────────────────────┐
                                ▼                                                ▼
                          Student DM: natija                          Parents group: natija
```

## Roles & chats

- **Student**: private chat with bot. Identified by `tg_user_id`.
- **Teacher**: member of a teachers chat registered with `/bindteachers` (admin only). Teachers tap inline buttons on the submission card.
- **Parents**: one Telegram group per class, registered with `/bindparents <GROUP_NAME>` sent from inside that parents group (any group admin can run it). The bot stores `chat_id ↔ group_name`. Since Telegram does not let bots resolve groups by display name, this binding step is mandatory.
- **Admin**: hardcoded list of `tg_user_id`s in an `admins` table; first admin is seeded via env or a one-time `/claimadmin <token>`.

## Database schema (Lovable Cloud)

```sql
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,                -- e.g. "5A"
  parents_chat_id bigint,                   -- set by /bindparents
  teachers_chat_id bigint,                  -- set by /bindteachers (optional per-group; else global)
  created_at timestamptz default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint unique not null,
  full_name text not null,
  group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz default now()
);

create table public.submissions (
  id bigserial primary key,
  student_id uuid references public.students(id) on delete cascade,
  group_id uuid references public.groups(id),
  file_id text not null,
  file_type text not null check (file_type in ('photo','document')),
  caption text,
  status text not null default 'pending' check (status in ('pending','reviewed')),
  ai_draft_grade text,
  ai_draft_feedback text,
  final_grade text,
  final_feedback text,
  reviewer_tg_id bigint,
  teacher_chat_id bigint,
  teacher_message_id bigint,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table public.conversation_state (
  tg_user_id bigint primary key,
  step text not null,                 -- ask_name | ask_group | ask_file | idle
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table public.admins (
  tg_user_id bigint primary key,
  added_at timestamptz default now()
);

create table public.teachers_chats (
  chat_id bigint primary key,
  label text,
  created_at timestamptz default now()
);
```

Standard GRANTs + RLS: all tables service-role only (the webhook runs server-side with `supabaseAdmin`). No anon/authenticated grants needed since there is no end-user web UI in Phase 1.

## Files to create

- `src/routes/api/public/telegram/webhook.ts` — webhook entry. Verifies `X-Telegram-Bot-Api-Secret-Token` (derived `sha256("telegram-webhook:" + TELEGRAM_API_KEY)` base64url), dispatches to handlers.
- `src/lib/telegram/client.server.ts` — thin wrappers over the connector gateway: `sendMessage`, `sendPhoto`, `sendDocument`, `editMessageCaption`, `editMessageReplyMarkup`, `answerCallbackQuery`, `getFile`, `downloadFile`.
- `src/lib/telegram/router.server.ts` — top-level dispatcher: command (`/start`, `/help`, `/bindparents`, `/bindteachers`, `/mystatus`, `/claimadmin`), callback_query (teacher buttons), file message, plain text (state-machine answers).
- `src/lib/telegram/flows/student.server.ts` — `/start` flow: ask name → ask group → ask file → save submission → fan out notifications. Step indicator "1/3, 2/3, 3/3".
- `src/lib/telegram/flows/teacher.server.ts` — renders the teacher submission card with inline buttons, handles callback to set final grade, prompts teacher reply for feedback, finalizes submission, edits the original card.
- `src/lib/telegram/flows/admin.server.ts` — `/bindparents`, `/bindteachers`, `/claimadmin`.
- `src/lib/ai/review.server.ts` — `draftReview(fileBytes, mime, caption)` → returns `{ grade, feedback }` in Uzbek via Lovable AI Gateway (multimodal: image_url for photos, file for PDFs).
- `src/lib/i18n/uz.ts` — all Uzbek strings in one file (commands descriptions, prompts, error messages, notifications). Keeps wording consistent and easy to tweak.
- `src/lib/telegram/secret.server.ts` — `deriveTelegramWebhookSecret()` + timing-safe compare helper.

The existing `src/routes/index.tsx` stays as a simple landing page noting the bot is the product; no auth UI in Phase 1.

## Uzbek copy (samples — final strings live in `uz.ts`)

- `/start` → "Assalomu alaykum! Vazifani yuborish uchun ismingizni kiriting. (1/3)"
- ask group → "Sinfingizni kiriting (masalan: 5A). (2/3)"
- ask file → "Endi vazifa faylini yuboring (rasm yoki hujjat). (3/3)"
- confirmation → "✅ Vazifa qabul qilindi. ID: #{id}. Holat: kutilmoqda."
- parents notify → "📢 {sinf} sinfidan {ism} yangi vazifa yubordi. ID: #{id}."
- teacher card → file + caption "🆕 #{id} • {ism} • {sinf}\nAI taklifi: {grade}\n{feedback}"
- result to student → "📊 Vazifangiz tekshirildi.\nBaho: {grade}\nIzoh: {feedback}"
- result to parents → same, addressed to parents group

## Flow details

**Student submission**
1. `/start` resets `conversation_state` to `ask_name`, draft `{}`.
2. Text reply → save name in draft, step `ask_group`, prompt with known groups list (inline keyboard built from `groups` table) + free text.
3. Group chosen → upsert `students` row, step `ask_file`.
4. Photo or document → insert `submissions` row (status=pending), reset state to idle, confirm to student.
5. Fan out:
   - Download file once via `getFile` for AI review.
   - Call `draftReview` → store `ai_draft_*`.
   - Send teacher card (photo/document + caption + inline keyboard `A'lo | Yaxshi | Qoniqarli | Qayta ishlash`).
   - Send parents-group notification if `groups.parents_chat_id` is set; otherwise log and skip (no crash).

**Teacher review (callback_query)**
1. Verify the tapping user's chat is a registered teachers chat.
2. Idempotency: refuse if `status='reviewed'`; `answerCallbackQuery` with "Allaqachon tekshirilgan".
3. Set `final_grade` to button value, ask teacher in same chat to reply with feedback text (reply-to the card). Capture by matching `reply_to_message.message_id == teacher_message_id`.
4. On feedback reply: update submission to `reviewed`, set `reviewer_tg_id`, `reviewed_at`, `final_feedback`.
5. Edit original card: remove inline keyboard, append "✅ Tekshirildi • baho • vaqt".
6. Notify student DM and parents group.

**Admin commands**
- `/claimadmin <token>` — token from `ADMIN_CLAIM_TOKEN` secret; inserts caller into `admins` once.
- `/bindparents <GROUP_NAME>` — must be sent inside a group; caller must be admin OR group admin (check via `getChatMember`); upserts `groups.parents_chat_id`.
- `/bindteachers [label]` — must be sent inside a group; admin only; inserts into `teachers_chats`.

## Edge cases handled in Phase 1

- Duplicate Telegram retries → idempotent on `update_id` (unique index on a `processed_updates` table) so re-deliveries don't double-send.
- Missing parents binding → student still gets confirmation; admin gets warning DM if registered.
- AI failure or 402/429 → submission still saved as pending; teacher card shows "AI taklifi mavjud emas".
- Non-Uzbek input handled gracefully; commands work regardless of language.
- File too large for AI multimodal → skip AI draft, still queue for teacher.

## Secrets / setup

- Telegram connector linked → provides `TELEGRAM_API_KEY` + `LOVABLE_API_KEY`.
- Lovable Cloud enabled → provides `SUPABASE_*` env including service role.
- New secret: `ADMIN_CLAIM_TOKEN` (asked once after Cloud + connector are ready).
- After deploy, register webhook from sandbox using the stable `project--<id>-dev.lovable.app` URL and the derived secret token, with `allowed_updates=["message","edited_message","callback_query"]`.

## Out of scope for this turn (Phase 2 — your "FEATURES TO IMPLEMENT" prompt)

`/resend`, `/history`, `/editreview`, `/resubmit`, weekly reports, `/groupstats`, `/studentstats`, `/stats`, `/export`, rate limiting, pagination polish. The schema above already leaves room for these (status field, timestamps, reviewer id, group/student FKs) so Phase 2 won't need a destructive migration.

## What I'll need from you when we switch to build mode

1. Permission to enable Lovable Cloud (creates the Postgres backend).
2. Permission to link the Telegram connector (you'll pick which bot connection to use).
3. A value for `ADMIN_CLAIM_TOKEN` (any random string — used once by you to become the first admin via `/claimadmin`).
