# The Greatest Rivalry — website

A static, fast, mobile-friendly single page that lets fans register interest in the
concept jersey, with an SA (green/gold) and NZ (black/silver) theme toggle, and pushes
every registration into Mailchimp via a small Cloudflare Worker.

```
index.html               the whole site (desktop + mobile, responsive CSS)
privacy-policy.html      POPIA privacy policy, linked from the consent checkbox
css/styles.css           theme variables + layout
js/config.js             prices, FX rates, countries, sizes, image paths — edit here
js/main.js               carousel, theme toggle, form logic, share/download
assets/logo/             placeholder logo — swap for your real exported emblem
assets/images/sa/        South Africa (green) product photography
assets/images/nz/        New Zealand (black) product photography
worker/                  Cloudflare Worker that writes registrations into Mailchimp
```

## 1a. Fonts

Both fonts are free Google Fonts, loaded via the `@import` at the top of
`css/styles.css` — no action needed:

- **Libre Caslon Text** — the "The Greatest Rivalry" wordmark only.
- **Inter** (weights 500/600/700) — everything else: body copy, buttons, labels,
  headings, the privacy policy.

## 1b. Add your real images

Drop your renders into `assets/images/sa/` and `assets/images/nz/`, using these exact
filenames (or edit the paths in `js/config.js` to match whatever you name them):

```
assets/images/sa/01-hero.jpg
assets/images/sa/02-teaser.jpg   ← also used as the background for "Download for Stories"
assets/images/sa/03-detail.jpg
assets/images/sa/04-tag.jpg
assets/images/nz/01-hero.jpg
assets/images/nz/02-teaser.jpg   ← also used as the background for "Download for Stories"
assets/images/nz/03-detail.jpg
assets/images/nz/04-tag.jpg
```

Until real files exist, the carousel shows a clearly-labelled placeholder telling you
exactly which file is missing — the site works fully without them.

Replace `assets/logo/logo-gold.svg` and `assets/logo/logo-white.svg` with your real
exported emblem (same filenames, or update the paths in `js/config.js`).

## 2. Preview locally

No build step — it's plain HTML/CSS/JS. From this folder:

```
python -m http.server 8080
```

then open `http://localhost:8080`. (The registration form will fail until the Worker
is deployed and `js/config.js` → `apiEndpoint` points at it — that's expected.)

## 3. Deploy the site on GitHub Pages

1. Create a new **public** GitHub repo (e.g. `greatest-rivalry-website`).
2. From this folder:
   ```
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/greatest-rivalry-website.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main /(root)**.
4. Your site is live at `https://<your-username>.github.io/greatest-rivalry-website/`
   within a minute or two.

## 4. Set up Mailchimp

You need **two audiences**:

| Audience | Purpose |
|---|---|
| **Greatest Rivalry — Registrations** | Every single registrant, regardless of the marketing checkbox. This is your feasibility-study data, and sends Mailchimp's own confirmation email ("please check your inbox and confirm your email" on the thank-you screen). |
| **Greatest Rivalry — Marketing Subscribers** | Only people who ticked "I agree to receive updates…" *and* clicked that same confirmation link. Use this for future campaign sends. |

**One confirmation email covers both.** Nobody gets asked to confirm twice: everyone
confirms once via the Registrations audience, and if they'd ticked the marketing box,
that same click is what adds them to Marketing Subscribers too (via a webhook — see
step 7 below and §5). This makes double opt-in do real work for lead quality — a
confirmed subscriber is someone who's proven their email address is real and
deliberately clicked through — without the drop-off of a second identical-looking email.

Steps:

1. **Create the two audiences**: Audience → Create Audience, twice, named as above.
2. **Double opt-in**: leave it **on** (default) for **Registrations** — the Worker adds
   new contacts there with `status: "pending"`, which makes Mailchimp send its own
   confirmation email automatically; no custom email infrastructure needed. For
   **Marketing Subscribers**, leave double opt-in **off** — it doesn't matter either
   way, since the Worker only ever adds people there with an explicit `status:
   "subscribed"` (from the webhook, after they've already confirmed via Registrations).
3. **Add merge fields** to *both* audiences (Audience → Settings → Audience fields and
   *MERGE* tags → Add A Field), using these exact tags so they match the Worker:
   - `COUNTRY` (text)
   - `JERSEY` (text)
   - `SIZE` (text)
   - `PRICE` (text)
   - `MKTOK` (text) — "Y" or "N", carries the marketing checkbox choice through to the
     webhook so it knows whether to add the person to Marketing Subscribers once they
     confirm
4. **Get your API key**: Account → Extras → API keys → Create A Key. It looks like
   `abcdef123456789-us21` — the part after the dash (`us21`) is your server prefix.
5. **Get each Audience ID**: Audience → Settings → Audience name and defaults → *Audience ID*.
6. **Set up the welcome email**: Audience → Automations → Create → "When someone joins
   a list" (a classic automation, trigger event **Subscribes**) → pick the
   **Registrations** audience as the trigger → design your welcome email (jersey
   images, project story, etc.) → turn it **on**. "Subscribes" fires once someone
   clicks the confirmation link — so people get exactly two emails in sequence:
   Mailchimp's confirmation, then your welcome email.
7. **Webhook** (adds confirmed marketing opt-ins to Marketing Subscribers): this needs
   the Worker's live URL, so it's the last step in §5 below, after deployment — come
   back here once that's done.
8. Keep the **Marketing Subscribers** audience automation-free — you'll send manual
   campaigns to it later when you have updates to share.

## 5. Deploy the Cloudflare Worker (the Mailchimp bridge)

The site is static, so it can't call Mailchimp directly without exposing your API key.
This Worker is a small, free backend that holds the key safely, writes to Mailchimp,
and receives its webhook. You already plan to use Cloudflare for DNS, so this fits
naturally.

1. Install Wrangler (Cloudflare's CLI) and log in:
   ```
   cd worker
   npm install
   npx wrangler login
   ```
2. Edit `wrangler.toml`:
   - `MAILCHIMP_SERVER_PREFIX` → e.g. `us21`
   - `MAILCHIMP_DATA_LIST_ID` → the Registrations audience ID
   - `MAILCHIMP_MARKETING_LIST_ID` → the Marketing Subscribers audience ID
   - `ALLOWED_ORIGIN` → your real site URL (GitHub Pages URL, or your custom domain
     once it's live)
3. Add two secrets (never put these in wrangler.toml or git):
   ```
   npx wrangler secret put MAILCHIMP_API_KEY
   ```
   Paste the full key (e.g. `abcdef123456789-us21`) when prompted, then:
   ```
   npx wrangler secret put MAILCHIMP_WEBHOOK_SECRET
   ```
   Paste any long random string (e.g. generate one with `openssl rand -hex 20`, or
   just mash the keyboard) — this isn't a Mailchimp value, it's one you invent, used
   in step 6 below so only Mailchimp's webhook can call this endpoint.
4. Deploy:
   ```
   npx wrangler deploy
   ```
   Wrangler prints a URL like `https://greatest-rivalry-api.<your-subdomain>.workers.dev`.
5. Back in the site, open `js/config.js` and set:
   ```js
   apiEndpoint: "https://greatest-rivalry-api.<your-subdomain>.workers.dev/register"
   ```
   Commit and push that change.
6. **Now go back to Mailchimp and add the webhook**: open the **Registrations**
   audience → Settings → Webhooks → Create New Webhook. URL:
   ```
   https://greatest-rivalry-api.<your-subdomain>.workers.dev/webhook/mailchimp?secret=<the MAILCHIMP_WEBHOOK_SECRET value you generated>
   ```
   Under "Update events", check **only** *Subscribes* — uncheck everything else
   (unsubscribes, profile updates, email changes, cleaned addresses, campaign
   sending). Save. Mailchimp will immediately GET that URL to validate it; the Worker
   answers `200 ok` to that automatically.

Test it directly:
```
curl -X POST https://greatest-rivalry-api.<your-subdomain>.workers.dev/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","country":"South Africa","jerseyPreference":"sa","size":"L","priceBand":"5-7k","marketingConsent":true}'
```
Then check both Mailchimp audiences for the new contact.

## 6. Connect your custom domain (GitHub Pages + Cloudflare)

To avoid the classic GitHub Pages + Cloudflare conflict (Cloudflare proxying breaking
Pages' automatic HTTPS/certificate), do this:

1. In GitHub repo settings → Pages, add your custom domain (e.g. `thegreatestrivalry.com`).
   This creates a `CNAME` file in the repo automatically — check it's committed.
2. In Cloudflare DNS for the domain, add:
   - `A` records for `@` pointing at GitHub Pages' four IPs (185.199.108.153,
     185.199.109.153, 185.199.110.153, 185.199.111.153)
   - `CNAME` for `www` → `<your-username>.github.io`
3. Set those DNS records to **DNS only** (grey cloud, not orange) *until* GitHub
   confirms the custom domain and issues an HTTPS certificate (Settings → Pages will show
   "DNS check successful" and an HTTPS checkbox). Only switch to Cloudflare's proxy
   (orange cloud) after that certificate is issued, and if you do, set Cloudflare's SSL
   mode to **Full (strict)**.
4. If you route the Worker at `/api/*` on the same domain (see the commented-out
   `[[routes]]` block in `worker/wrangler.toml`), that only works while the domain's DNS
   is proxied through Cloudflare (orange cloud) — so decide whether the Worker will live
   on a workers.dev URL (simplest, no conflict) or on `/api/*` of your main domain
   (needs the orange cloud). Using the plain `workers.dev` URL is the path of least
   resistance and is what `js/config.js` defaults to.

## 7. Updating things later

- **FX rates / price bands**: edit `js/config.js` → `CONFIG.fx` and `CONFIG.priceBands`.
- **Countries / sizes**: edit the arrays in `js/config.js`.
- **Share text / URL**: edit `CONFIG.shareUrl` / `CONFIG.shareText` in `js/config.js`.
- **Privacy policy placeholder**: `privacy-policy.html` still has one highlighted
  `TODO` span for the physical business address — fill that in before you launch
  publicly.

## 8. Testing checklist before going live

- [ ] Toggle SA ↔ NZ theme — colors, logo and carousel images all switch
- [ ] Carousel arrows work on both mobile and desktop widths
- [ ] Form validation catches missing email / country / jersey / price
- [ ] Submitting a real test entry appears in the Registrations audience as `pending`
      (regardless of the marketing checkbox) — nowhere in Marketing Subscribers yet
- [ ] Mailchimp's confirmation email arrives; clicking it flips the Registrations
      contact to `subscribed` and the welcome-email automation fires shortly after
- [ ] If the marketing checkbox was ticked, that same click also creates the contact
      in Marketing Subscribers as `subscribed` (check the webhook fired — Registrations
      audience → Settings → Webhooks → should show recent activity/no errors); if it
      wasn't ticked, confirm they're still absent from Marketing Subscribers
- [ ] "Download for Stories" produces a 1080×1920 PNG with the right jersey colour
- [ ] "Share on WhatsApp" opens with pre-filled text and link
- [ ] "Copy Link" copies the URL (and has a clipboard-denied fallback via `prompt()`)
- [ ] Privacy Policy page loads and all TODO placeholders are resolved
- [ ] Site loads fast on mobile data (images optimised/compressed before upload)
