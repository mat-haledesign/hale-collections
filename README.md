# The 105 Jersey — website

A static, fast, mobile-friendly single page that lets fans register interest in the
concept jersey, with an SA (green/gold) and NZ (black/silver) theme toggle, and pushes
every registration into Mailchimp via a small Cloudflare Worker.

```
index.html               the whole site (desktop + mobile, responsive CSS)
privacy-policy.html      POPIA privacy policy, linked from the consent checkbox
css/styles.css           theme variables + layout
js/config.js             prices, FX rates, countries, sizes, image paths — edit here
js/main.js               carousel, theme toggle, form logic, share/download
assets/logo/             logo — SVG for each theme
assets/images/sa/        South Africa (green) product photography (.webp)
assets/images/nz/        New Zealand (black) product photography (.webp)
worker/                  Cloudflare Worker that writes registrations into Mailchimp
```

## Live setup

- **Site**: https://hale-collections.com — GitHub Pages, custom domain via Cloudflare DNS.
- **Worker**: `the-105-jersey-api`, deployed at
  `https://the-105-jersey-api.hale-collections.workers.dev`.
- **Mailchimp** (server prefix `us12`): a **Registrations** audience (`d8cdda9c99`) that
  every registrant lands in, and a **Marketing Subscribers** audience (`34925f35ba`) that
  only opted-in, confirmed contacts reach.

The sections below are reference for making changes or rebuilding from scratch — not a
first-time setup checklist, since all of this is already live.

## Fonts

Both fonts are free Google Fonts, loaded via the `@import` at the top of
`css/styles.css` — no action needed:

- **Libre Caslon Text** — the wordmark only.
- **Inter** (weights 500/600/700) — everything else: body copy, buttons, labels,
  headings, the privacy policy.

## Images

Carousel photography lives in `assets/images/sa/` and `assets/images/nz/` as `.webp`
(compressed for fast mobile loading), using the filenames listed in `js/config.js` →
`CONFIG.carousel`. `07-download.webp` in each folder is a separate, finished
1080×1920 graphic used as-is for "Download for Stories" — not composited at runtime.

If a listed image file is missing, the carousel shows a clearly-labelled placeholder
naming exactly which file is missing, so the site still works without it.

## Preview locally

No build step — it's plain HTML/CSS/JS. From this folder:

```
python -m http.server 8080
```

then open `http://localhost:8080`. To preview on a phone on the same Wi-Fi, use your
machine's LAN IP instead of `localhost` (e.g. `http://192.168.x.x:8080`) and bind the
server to all interfaces if needed.

## Deploying the site

Push to `main` — GitHub Pages serves straight from the repo root (Settings → Pages →
Deploy from a branch → `main` / `(root)`). Changes are usually live within a minute or
two. If Cloudflare is proxying the domain, purge its cache after a deploy so visitors
don't get a stale cached copy of `index.html`/`main.js`/`styles.css`.

## Mailchimp

Two audiences, one confirmation email covering both:

| Audience | Purpose |
|---|---|
| **Registrations** (`d8cdda9c99`) | Every registrant, regardless of the marketing checkbox. Feasibility-study data. Double opt-in is **on** — the Worker adds new contacts as `status: "pending"`, so Mailchimp sends its own confirmation email ("please check your inbox and confirm your email" on the thank-you screen). |
| **Marketing Subscribers** (`34925f35ba`) | Only people who ticked "I agree to receive updates…" *and* clicked that same confirmation link. Populated by the webhook below, never directly by the form — so nobody is ever asked to confirm twice. Used for future campaign sends. |

Both audiences share the same merge fields: `COUNTRY`, `JERSEY`, `SIZE`, `PRICE`,
`MKTOK` (text, "Y"/"N" — carries the marketing checkbox choice through to the webhook).

**Welcome email**: Audience → Automations, a classic automation on the Registrations
audience triggered by **Subscribes** (fires once someone clicks the confirmation link).
Sequence for an opted-in registrant is: Mailchimp's confirmation email, then this
welcome email shortly after (delivery can lag by several minutes).

**Webhook** (adds confirmed marketing opt-ins to Marketing Subscribers): configured on
the Registrations audience → Settings → Webhooks, pointed at
`https://the-105-jersey-api.hale-collections.workers.dev/webhook/mailchimp?secret=<MAILCHIMP_WEBHOOK_SECRET>`,
with only the **Subscribes** update event enabled, and "Contact update sources" must
include **By a contact** — otherwise a person confirming their own email is filtered
out and the webhook never fires.

## The Cloudflare Worker

The site is static, so it can't call Mailchimp directly without exposing the API key.
The Worker holds the key safely, writes to Mailchimp, and receives its webhook.

```
cd worker
npm install
npx wrangler login      # once per machine
npx wrangler deploy
```

Config lives in `worker/wrangler.toml` (`[vars]` — server prefix, both audience IDs,
allowed CORS origin). Secrets are never committed — set them per-environment with:

```
npx wrangler secret put MAILCHIMP_API_KEY
npx wrangler secret put MAILCHIMP_WEBHOOK_SECRET
```

`MAILCHIMP_WEBHOOK_SECRET` isn't a Mailchimp value — it's an invented random string
(e.g. `openssl rand -hex 20`) shared between the Worker and the webhook URL configured
in Mailchimp, so only Mailchimp can call that endpoint.

Renaming or redeploying the Worker under a new name creates a **separate** Worker with
no secrets and no history — re-run the two `secret put` commands above, update
`apiEndpoint` in `js/config.js`, and update the webhook URL in Mailchimp to match.

Quick health check:
```
curl https://the-105-jersey-api.hale-collections.workers.dev/health
```

## Custom domain (GitHub Pages + Cloudflare)

To avoid the classic GitHub Pages + Cloudflare conflict (Cloudflare proxying breaking
Pages' automatic HTTPS/certificate):

1. GitHub repo settings → Pages → custom domain. This writes the `CNAME` file in the
   repo — keep it committed.
2. Cloudflare DNS: `A` records for `@` pointing at GitHub Pages' four IPs
   (185.199.108.153, .109.153, .110.153, .111.153), plus a `CNAME` for `www`.
3. Keep those records **DNS only** (grey cloud) until GitHub confirms the domain and
   issues its HTTPS certificate. Only switch to Cloudflare's proxy (orange cloud)
   afterward, with SSL mode set to **Full (strict)**.
4. The Worker lives on its own `workers.dev` URL rather than `/api/*` of the main
   domain — simpler, and doesn't require the domain to be proxied through Cloudflare.

## Updating things later

- **FX rates / price bands**: edit `js/config.js` → `CONFIG.fx` and `CONFIG.priceBands`.
- **Countries / sizes**: edit the arrays in `js/config.js`.
- **Share text / URL**: edit `CONFIG.shareUrl` / `CONFIG.shareText` in `js/config.js`.

## Regression checklist after changes

- [ ] Toggle SA ↔ NZ theme — colors, logo and carousel images all switch
- [ ] Carousel arrows, dots and swipe (mobile) all work
- [ ] Form validation catches missing email / country / jersey / price
- [ ] Submitting a real test entry appears in the Registrations audience as `pending`
      (regardless of the marketing checkbox) — nowhere in Marketing Subscribers yet
- [ ] Mailchimp's confirmation email arrives; clicking it flips the Registrations
      contact to `subscribed` and the welcome-email automation fires shortly after
- [ ] If the marketing checkbox was ticked, that same click also creates the contact
      in Marketing Subscribers as `subscribed`; if it wasn't ticked, confirm they're
      still absent from Marketing Subscribers
- [ ] "Download for Stories" produces the right jersey-colour image
- [ ] "Share on WhatsApp" opens with pre-filled text and link
- [ ] "Copy Link" copies the URL (and has a clipboard-denied fallback via `prompt()`)
- [ ] Privacy Policy page loads and matches the live form's actual consent wording
- [ ] Site loads fast on mobile data

For repeat testing without hitting Mailchimp's GDPR "forgotten email" permanent-delete
block, use Gmail plus-addressing (`you+test1@gmail.com`) and always **Archive** test
contacts afterward rather than "Delete Permanently".
