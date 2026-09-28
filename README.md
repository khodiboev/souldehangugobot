# Seoul Korean — Uzbek Telegram bot

A lightweight TypeScript / grammY bot that displays prepared JSON lessons. No AI calls, database, or PDF processing occurs in the bot. Uses long polling.

## Run locally

Use Node.js 22 LTS (also compatible with Node 20).

```sh
npm ci
[ -f .env ] || cp .env.example .env
# Open .env locally and set BOT_TOKEN. Never paste it into a chat.
npm run check
npm test
npm run dev
```

Only run one polling instance for each bot token. Stop with Ctrl+C. For compiled execution: `npm run build` then `npm start`. Run commands from this project directory. The existing local .env was copied privately from the previous project directory. Do not overwrite it with .env.example if you want to reuse that configuration. The bot successfully connected to Telegram in a short smoke test and was then stopped. No credentials are printed or included in source files.

`npm run dev` and `npm start` run in the foreground. Closing their terminal stops the bot. A GitHub push stores the code but does not host or run it. To keep the bot running after closing a terminal, use a background service such as the included Docker Compose configuration or deploy it to an always-on server. A Mac-hosted bot also pauses when the Mac sleeps or shuts down.

## Navigation

`/start` or `/books` → book → unit → Vocabulary / Grammar / Examples / Story. Each selection edits the current message. Long sections have previous/next page buttons. Every section includes section shortcuts, lesson overview, previous/next unit, and contents. Unavailable units show a popup. Translations use Telegram HTML spoilers. `/help` explains the controls in Uzbek.

## Content

Every `data/*.json` is loaded at startup, validated with Zod, and sorted by book ID (natural ordering). Restart after editing content. IDs must be 1–12 lowercase ASCII letters, numbers, underscores, or hyphens. Unit IDs and numbers must be unique within a book; book IDs must be unique. Add 1B by supplying a validated `data/1b.json`.

`src/content.ts` defines the schema. `available: false` units need only metadata. Ready units require goals, vocabulary groups, grammar, dialogues and a story. `num: 0` is reserved for Hangul. Vocabulary supports optional `pos` (part of speech). Only balanced `<b>...</b>` markup in grammar explanations is interpreted; all other content is escaped. Pagination closes and reopens HTML tags safely and never splits HTML entities or Unicode code points.

The bot currently includes 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B, 6A, and 6B. Every ready unit contains vocabulary, the source curriculum's grammar modules, at least two dialogues, and a continuing story. In 5B, the final literature lesson revisits three earlier patterns because its source scope introduces no new grammar. These are adapted learning courses rather than page-for-page copies of every textbook exercise. Where a supplied PDF is unreadable, topic-based supplements use checked sources and original Uzbek explanations, as authorized by the user. No textbook pages or textbook dialogues are bundled. The `CONTENT_REVIEW*.md` files record source coverage; the `*mazmun.md` files are readable exports.

See CONTENT_REVIEW.md for editorial issues to address before publishing the learning content.

## Validation

`npm run check` validates data, message lengths and callback sizes. `npm test` verifies HTML safety, Unicode pagination, schema rejection, all lesson pages, alphabet completeness, and navigation with mocked Telegram updates. `npm run build` type-checks the application. Live Telegram startup and command registration passed. Visual rendering and button interaction in the Telegram client still need a manual `/start` check.

## Container (prepared, not deployed)

```sh
docker compose up -d --build
docker compose logs --tail=30
```

The image uses Node 22, runs as a non-root user, excludes `.env` from the build context, and reads credentials from Compose `env_file`. JSON data is mounted read-only. Do not run the local process and container simultaneously with the same token. No domain or webhook is required. Docker has not been deployed by this task.

References: [grammY](https://grammy.dev/guide/basics), [Telegram Bot API](https://core.telegram.org/bots/api).

## Apply the updated lessons

If the bot is already running, stop that process with Ctrl+C and run `npm run dev` again in this directory. For compiled execution, run `npm run build` before `npm start`. Do not start a second polling instance. Open `/books` in Telegram to refresh the unit list. No token changes or dependency installation are required for this content update.
