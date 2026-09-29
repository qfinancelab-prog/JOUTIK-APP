# Joutik — Phase 1 React Native Scaffold

Wires directly to the `joutik-backend` functions and tables — every
screen here calls something that already exists on the backend, no
new server logic implied by anything in this app.

## Setup

```
cp .env.example .env    # fill in your Supabase URL + anon key
npm install
npx expo start
```

## Language architecture (what was just added)

Two completely separate things, on purpose:

1. **UI chrome language** (`src/i18n/`) — buttons, labels,
   instructions. Currently English + Hindi (`translations.ts`).
   Stored in `profiles.ui_language`, chosen on `LanguageSelectScreen`
   right after sign-in. Adding a language later means adding one
   entry to `SUPPORTED_LANGUAGES` and one dictionary object — no
   translation engine, nothing dynamic.

2. **Question/answer content language** — never translated,
   anywhere. A student types or speaks in whatever language they're
   actually comfortable with; the device's own keyboard handles
   whatever script that requires (React Native's plain `TextInput`
   doesn't restrict this — no extra work needed). The query is
   tagged with `question_language` (defaulted to the student's
   `ui_language`, since in practice most people ask in the same
   language their interface is in). A teacher only sees that query
   at all if they've registered that language in `teacher_languages`
   — enforced by the database (`019_language_matching.sql`), not by
   client-side filtering. The teacher answers in that language
   because they already know it — no OCR, no transcription, no
   translation API anywhere in this loop, matching the product
   decision to keep this lightweight.

**Fallback behavior**: a teacher who hasn't registered any languages
yet sees queries in every language, so a half-onboarded teacher
account doesn't silently go empty. Once they register at least one
language (via `TeacherOnboardingScreen`), the filter becomes strict.

## What's genuinely working end to end right now

- Sign in (email OTP)
- Choose UI language (English/Hindi)
- Student: ask a question (text + photo + voice), tagged with their language
- Teacher: onboard (subjects + languages), see a feed filtered by
  both, tap Accept (atomic, race-safe)
- Both: message thread (text + voice), student can mark resolved
  with feedback, teacher's credibility card renders with real
  badges/stats
- Voice: original audio preserved exactly as recorded — no
  transcription, no translation, no AI processing anywhere in the
  pipeline. Playback works for both sent and received voice notes.
  Sends are offline-safe: a recording made with no connectivity is
  queued locally (AsyncStorage), shows pending/uploading/failed
  status in the thread, retries automatically on reconnect (via
  NetInfo), and is idempotent — a retry can never create a duplicate
  message, enforced by `local_op_id` at the database level
  (`020_messages_idempotency.sql`), not just client-side care.

## What's deliberately not in this slice

- **Offline query *creation*** — the send queue above covers
  messages *within* an already-posted query. Posting the initial
  question while offline (draft → attach → `post_query()`) is a
  separate, larger piece of work: it needs the same idempotency
  treatment applied to `queries` and `query_attachments` together,
  plus a background sync trigger, not just a retry-on-reconnect
  listener. Next up after the admin CRM.
- **Role switching on one account** — `navigation/index.tsx` picks
  student or teacher UI based on `profiles.role` at load time; a
  settings screen to switch is a small addition once the core loop
  is verified.
- **Admin CRM** — separate web app, not started yet.
- **3rd+ language** — architecture supports it (see above), just
  hasn't been added since Tier 1 per the product decision was
  English + Hindi + Bengali; Bengali strings aren't written yet.

## Production-readiness status (read this before calling anything here "done")

"Clickable end to end" and "production-ready" are different claims,
and this slice is only the first one. What's actually been hardened
so far, versus what still needs work before real users touch this:

**Hardened / verified:**
- Atomic first-accept (primary-key-enforced, no race window —
  see `joutik-backend/README.md`'s verification section)
- Role/status/verification field escalation (guard triggers, closed
  two real bugs found during this build — see backend README)
- Message send idempotency (this round's work)
- Attachment size limits enforced server-side, not just client-side

**Not yet hardened — do not treat as production-safe until these are
done:**
- **Auth hardening** — email OTP only, no rate limiting on OTP
  requests, no account lockout/abuse detection, no phone OTP yet
- **Rate limiting** — nothing in this stack currently limits how
  fast a single account can post queries, send messages, or call
  `accept_query()`; a malicious or buggy client could hammer any
  endpoint
- **Backups** — no backup/restore strategy defined for the Supabase
  Postgres instance or Storage buckets
- **Attachment security beyond RLS** — no virus/malware scanning on
  uploads, no content-type verification beyond what the client
  claims (a client could label a non-audio file as `voice` and it
  would currently be accepted)
- **Concurrency testing at real scale** — now covered by a permanent
  regression suite (`joutik-backend/tests/first-accept/`) that runs
  20-50 simultaneous real accept attempts against a fresh query for
  100+ rounds and checks six separate invariants each time, per your
  point about this being one of the most important invariants in the
  system. Writing the suite doesn't run it for you, though — it
  needs to actually be run against your deployed project (and wired
  into CI, per its README) before this is truly verified rather than
  reasoned-through.
- **Deployment security** — no review yet of Supabase project
  settings (API exposure, service-role key handling, CORS), no
  secrets management story beyond `.env` for local dev
- **Offline query creation** — see above

None of this is meant to be alarming — it's the normal and expected
state of a Phase 1 slice. It's flagged explicitly so nothing here
gets mistaken for more finished than it is.

## Testing the language matching specifically

1. Create two teacher accounts. Register one for Hindi only, the
   other for English only, both in the same subject.
2. As a student, set UI language to Hindi and post a query (it'll be
   tagged `question_language: 'hi'`).
3. Confirm only the Hindi-registered teacher sees it in their feed —
   the English-only teacher's feed should not show it at all, not
   even in a translated/gated form.
