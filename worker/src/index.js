/**
 * Cloudflare Worker: receives registrations from thegreatestrivalry.com
 * and writes them into two Mailchimp audiences.
 *
 * A SINGLE confirmation email covers both audiences (both are double
 * opt-in, but only one email is ever sent per person):
 *   1. POST /register  — always upserts into MAILCHIMP_DATA_LIST_ID
 *      (Registrations) as status "pending". Mailchimp sends its own
 *      confirmation email. The person's marketing choice is stashed in
 *      the MKTOK merge field, but they are NOT added to the Marketing
 *      audience yet.
 *   2. POST /webhook/mailchimp — called by Mailchimp when that contact
 *      confirms (the "Subscribes" event fires on pending -> subscribed).
 *      If MKTOK was "Y", *now* upsert them into MAILCHIMP_MARKETING_LIST_ID
 *      as "subscribed" — no second confirmation email, since clicking the
 *      one link already proved the address and the on-site checkbox
 *      already captured the consent.
 *
 * Required secrets/vars (see README.md for exact setup steps):
 *   MAILCHIMP_API_KEY          secret, e.g. abcdef123456-us21
 *   MAILCHIMP_SERVER_PREFIX    e.g. us21 (the suffix after the dash in the API key)
 *   MAILCHIMP_DATA_LIST_ID     Audience ID of the "Registrations" audience
 *   MAILCHIMP_MARKETING_LIST_ID  Audience ID of the "Marketing Subscribers" audience
 *   MAILCHIMP_WEBHOOK_SECRET   secret, random string you also put in the
 *                              webhook URL configured in Mailchimp, so
 *                              random requests to /webhook/mailchimp are
 *                              rejected (Mailchimp doesn't sign webhooks)
 *   ALLOWED_ORIGIN              e.g. https://thegreatestrivalry.com
 */

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true }, 200, corsHeaders);
    }

    if (url.pathname === "/webhook/mailchimp") {
      return handleMailchimpWebhook(request, env);
    }

    if (url.pathname !== "/register" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return json({ error: "Invalid JSON" }, 400, corsHeaders);
    }

    // Honeypot: bots that fill hidden fields get a fake success, no Mailchimp call.
    if (body.company) {
      return json({ ok: true }, 200, corsHeaders);
    }

    const email = String(body.email || "").trim().toLowerCase();
    const country = String(body.country || "").trim();
    const jerseyPreference = String(body.jerseyPreference || "").trim();
    const size = body.size ? String(body.size).trim() : "";
    const priceBand = String(body.priceBand || "").trim();
    const marketingConsent = body.marketingConsent === true;

    if (!isValidEmail(email) || !country || !jerseyPreference || !priceBand) {
      return json({ error: "Missing or invalid required fields" }, 400, corsHeaders);
    }

    const mergeFields = {
      COUNTRY: country,
      JERSEY: jerseyPreference,
      SIZE: size,
      PRICE: priceBand,
      MKTOK: marketingConsent ? "Y" : "N",
    };

    try {
      // Only ever write to the data/registrations audience here, as "pending" so
      // Mailchimp sends its own double opt-in confirmation email (matches the
      // "please check your inbox and confirm your email" copy on the thank-you
      // screen). The marketing audience is populated later, by the webhook below,
      // once this same confirmation is clicked — never here, so nobody gets a
      // second confirmation email.
      await upsertMember(env, env.MAILCHIMP_DATA_LIST_ID, email, mergeFields, [
        ...jerseyTagSet(jerseyPreference),
        ...marketingTagSet(marketingConsent),
      ], "pending");

      return json({ ok: true }, 200, corsHeaders);
    } catch (err) {
      console.error(err);
      if (err.code === "FORGOTTEN_EMAIL") {
        return json({
          error: "This email address was previously removed from our list and can't be automatically re-added. Please try a different email address, or contact us directly.",
        }, 400, corsHeaders);
      }
      return json({ error: "Registration failed" }, 502, corsHeaders);
    }
  },
};

/**
 * Mailchimp calls this once (GET) when you save the webhook, to check it
 * resolves, then POSTs form-encoded (not JSON) bodies as events happen.
 * We only care about the "subscribe" event on the Registrations audience —
 * that's the pending -> subscribed transition, i.e. the confirmation click.
 */
async function handleMailchimpWebhook(request, env) {
  if (request.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  if (!env.MAILCHIMP_WEBHOOK_SECRET || providedSecret !== env.MAILCHIMP_WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const raw = await request.text();
  const params = new URLSearchParams(raw);

  const type = params.get("type");
  const listId = params.get("data[list_id]");
  const email = (params.get("data[email]") || "").trim().toLowerCase();
  const marketingOk = params.get("data[merges][MKTOK]");

  // Always 200 back to Mailchimp for events we deliberately ignore — a
  // non-2xx response makes Mailchimp retry, and eventually disable, the
  // webhook, which would silently break real confirmations too.
  if (type !== "subscribe" || listId !== env.MAILCHIMP_DATA_LIST_ID || marketingOk !== "Y" || !email) {
    return new Response("ignored", { status: 200 });
  }

  const jerseyPreference = params.get("data[merges][JERSEY]") || "";
  const mergeFields = {
    COUNTRY: params.get("data[merges][COUNTRY]") || "",
    JERSEY: jerseyPreference,
    SIZE: params.get("data[merges][SIZE]") || "",
    PRICE: params.get("data[merges][PRICE]") || "",
    MKTOK: "Y",
  };

  try {
    await upsertMember(env, env.MAILCHIMP_MARKETING_LIST_ID, email, mergeFields, jerseyTagSet(jerseyPreference), "subscribed");
  } catch (err) {
    console.error(err);
    // Still 200: this is a background side-effect, not something Mailchimp
    // retrying will fix (the failure is on our/Mailchimp's API side, not
    // the webhook delivery), and we don't want the webhook disabled.
  }

  return new Response("ok", { status: 200 });
}

async function upsertMember(env, listId, email, mergeFields, tags, statusIfNew) {
  const server = env.MAILCHIMP_SERVER_PREFIX;
  const hash = await md5Hex(email);
  const endpoint = `https://${server}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}`;

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      "Authorization": "Basic " + btoa("anystring:" + env.MAILCHIMP_API_KEY),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: email,
      status_if_new: statusIfNew,
      merge_fields: mergeFields,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();

    // A contact that was permanently deleted (GDPR erasure) can never be
    // re-added via the API, by Mailchimp's design — only by genuinely
    // re-subscribing through an actual signup form. Surface this distinctly
    // so the site can show something more useful than a generic failure.
    let mailchimpTitle;
    try { mailchimpTitle = JSON.parse(errText).title; } catch (e) { /* not JSON */ }
    if (mailchimpTitle === "Forgotten Email Not Subscribed") {
      const err = new Error(`Mailchimp upsert failed (${res.status}) for list ${listId}: ${errText}`);
      err.code = "FORGOTTEN_EMAIL";
      throw err;
    }

    throw new Error(`Mailchimp upsert failed (${res.status}) for list ${listId}: ${errText}`);
  }

  // Tags are set via a separate endpoint. Mailchimp's tag API is additive by
  // default — it only ever turns tags *on*, never off, so re-registering with a
  // different jersey/marketing choice would otherwise leave the old tag stuck
  // alongside the new one. `tags` here must always be the FULL set of related
  // tags with the correct active/inactive status on each, not just the "on" ones,
  // so re-tagging is exclusive rather than additive.
  const tagRes = await fetch(endpoint + "/tags", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa("anystring:" + env.MAILCHIMP_API_KEY),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tags: tags.map(t => ({ name: t.name, status: t.active ? "active" : "inactive" })),
    }),
  });

  if (!tagRes.ok) {
    const errText = await tagRes.text();
    throw new Error(`Mailchimp tagging failed (${tagRes.status}) for list ${listId}: ${errText}`);
  }
}

const JERSEY_TAGS = ["Jersey: South Africa", "Jersey: New Zealand", "Jersey: Both"];

function jerseyTagSet(jerseyPreference) {
  const active =
    jerseyPreference === "sa" ? "Jersey: South Africa" :
    jerseyPreference === "nz" ? "Jersey: New Zealand" :
    "Jersey: Both";
  return JERSEY_TAGS.map(name => ({ name, active: name === active }));
}

const MARKETING_TAGS = ["Marketing: Opted in", "Marketing: Not opted in"];

function marketingTagSet(marketingConsent) {
  const active = marketingConsent ? "Marketing: Opted in" : "Marketing: Not opted in";
  return MARKETING_TAGS.map(name => ({ name, active: name === active }));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/* ---- MD5 (needed for Mailchimp's subscriber-hash member URLs) ---- */
/* Compact, dependency-free MD5 implementation (public domain, adapted). */

async function md5Hex(input) {
  const msgBytes = new TextEncoder().encode(input);
  const words = bytesToWords(msgBytes);
  const bitLen = msgBytes.length * 8;

  words[bitLen >> 5] |= 0x80 << (bitLen % 32);
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const [aa, bb, cc, dd] = [a, b, c, d];

    a = ff(a, b, c, d, words[i + 0] | 0, 7, -680876936);
    d = ff(d, a, b, c, words[i + 1] | 0, 12, -389564586);
    c = ff(c, d, a, b, words[i + 2] | 0, 17, 606105819);
    b = ff(b, c, d, a, words[i + 3] | 0, 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4] | 0, 7, -176418897);
    d = ff(d, a, b, c, words[i + 5] | 0, 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6] | 0, 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7] | 0, 22, -45705983);
    a = ff(a, b, c, d, words[i + 8] | 0, 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9] | 0, 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10] | 0, 17, -42063);
    b = ff(b, c, d, a, words[i + 11] | 0, 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12] | 0, 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13] | 0, 12, -40341101);
    c = ff(c, d, a, b, words[i + 14] | 0, 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15] | 0, 22, 1236535329);

    a = gg(a, b, c, d, words[i + 1] | 0, 5, -165796510);
    d = gg(d, a, b, c, words[i + 6] | 0, 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11] | 0, 14, 643717713);
    b = gg(b, c, d, a, words[i + 0] | 0, 20, -373897302);
    a = gg(a, b, c, d, words[i + 5] | 0, 5, -701558691);
    d = gg(d, a, b, c, words[i + 10] | 0, 9, 38016083);
    c = gg(c, d, a, b, words[i + 15] | 0, 14, -660478335);
    b = gg(b, c, d, a, words[i + 4] | 0, 20, -405537848);
    a = gg(a, b, c, d, words[i + 9] | 0, 5, 568446438);
    d = gg(d, a, b, c, words[i + 14] | 0, 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3] | 0, 14, -187363961);
    b = gg(b, c, d, a, words[i + 8] | 0, 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13] | 0, 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2] | 0, 9, -51403784);
    c = gg(c, d, a, b, words[i + 7] | 0, 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12] | 0, 20, -1926607734);

    a = hh(a, b, c, d, words[i + 5] | 0, 4, -378558);
    d = hh(d, a, b, c, words[i + 8] | 0, 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11] | 0, 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14] | 0, 23, -35309556);
    a = hh(a, b, c, d, words[i + 1] | 0, 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4] | 0, 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7] | 0, 16, -155497632);
    b = hh(b, c, d, a, words[i + 10] | 0, 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13] | 0, 4, 681279174);
    d = hh(d, a, b, c, words[i + 0] | 0, 11, -358537222);
    c = hh(c, d, a, b, words[i + 3] | 0, 16, -722521979);
    b = hh(b, c, d, a, words[i + 6] | 0, 23, 76029189);
    a = hh(a, b, c, d, words[i + 9] | 0, 4, -640364487);
    d = hh(d, a, b, c, words[i + 12] | 0, 11, -421815835);
    c = hh(c, d, a, b, words[i + 15] | 0, 16, 530742520);
    b = hh(b, c, d, a, words[i + 2] | 0, 23, -995338651);

    a = ii(a, b, c, d, words[i + 0] | 0, 6, -198630844);
    d = ii(d, a, b, c, words[i + 7] | 0, 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14] | 0, 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5] | 0, 21, -57434055);
    a = ii(a, b, c, d, words[i + 12] | 0, 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3] | 0, 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10] | 0, 15, -1051523);
    b = ii(b, c, d, a, words[i + 1] | 0, 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8] | 0, 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15] | 0, 10, -30611744);
    c = ii(c, d, a, b, words[i + 6] | 0, 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13] | 0, 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4] | 0, 6, -145523070);
    d = ii(d, a, b, c, words[i + 11] | 0, 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2] | 0, 15, 718787259);
    b = ii(b, c, d, a, words[i + 9] | 0, 21, -343485551);

    a = safeAdd(a, aa);
    b = safeAdd(b, bb);
    c = safeAdd(c, cc);
    d = safeAdd(d, dd);
  }

  return [a, b, c, d].map(wordToHex).join("");
}

function bytesToWords(bytes) {
  const words = new Array(((bytes.length + 3) >> 2) + 4).fill(0);
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  }
  return words;
}

function cmn(q, a, b, x, s, t) {
  return safeAdd(rotl(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}
function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
function wordToHex(word) {
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += ((word >> (i * 8 + 4)) & 0xf).toString(16) + ((word >> (i * 8)) & 0xf).toString(16);
  }
  return hex;
}
