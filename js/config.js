/**
 * Central config: edit these values as the project evolves.
 * No other file should hardcode prices, rates, image paths or copy.
 */
const CONFIG = {
  // Where the Cloudflare Worker lives. Update after you deploy it (see README).
  apiEndpoint: "https://greatest-rivalry-api.yourdomain.workers.dev/register",

  // Approximate fixed FX rates, ZAR to 1 unit of foreign currency.
  // e.g. usdRate: 19 means R19 = $1. Edit these whenever you want to refresh pricing.
  fx: {
    usdRate: 19,
    eurRate: 21,
    nzdRate: 11
  },

  // Price bands in ZAR. Foreign currency columns are derived automatically from fx rates above.
  priceBands: [
    { id: "3-5k", zarMin: 3000, zarMax: 5000 },
    { id: "5-7k", zarMin: 5000, zarMax: 7000 },
    { id: "7-10k", zarMin: 7000, zarMax: 10000 },
    { id: "10k-plus", zarMin: 10000, zarMax: null }
  ],

  sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],

  countries: [
    "South Africa", "New Zealand", "Australia", "United Kingdom", "Ireland",
    "United States", "Canada", "Namibia", "Argentina", "France", "Other"
  ],

  // Carousel images per theme. Drop real photography into assets/images/sa and assets/images/nz
  // using these exact filenames, or edit the paths below to match what you supply.
  carousel: {
    sa: [
      "assets/images/sa/01-hero.png",
      "assets/images/sa/02-chest.png",
      "assets/images/sa/03-collar.png",
      "assets/images/sa/04-back.png",
      "assets/images/sa/05-tag.png",
      "assets/images/sa/06-sleeve.png"
    ],
    nz: [
      "assets/images/nz/01-hero.png",
      "assets/images/nz/02-chest.png",
      "assets/images/nz/03-collar.png",
      "assets/images/nz/04-back.png",
      "assets/images/nz/05-tag.png",
      "assets/images/nz/06-sleeve.png"
    ]
  },

  // Full-bleed portrait image used as the background for the "download for stories" image.
  storyTemplate: {
    sa: "assets/images/sa/07-download.png",
    nz: "assets/images/nz/07-download.png"
  },

  logo: {
    sa: "assets/logo/logo-gold.svg",
    nz: "assets/logo/logo-white.svg"
  },

  shareUrl: "https://hale-collections.com",
  shareText: "105 years. Two nations. One enduring contest. Vote on whether this jersey should be made -"
};

function formatZAR(amount) {
  return "R" + amount.toLocaleString("en-ZA");
}

function convert(amountZar, rate) {
  return Math.round(amountZar / rate / 5) * 5; // round to nearest 5 for clean display
}

function priceBandLabel(band) {
  const zar = band.zarMax
    ? `${formatZAR(band.zarMin)}–${formatZAR(band.zarMax)}`
    : `${formatZAR(band.zarMin)}+`;

  const fmt = (min, max, symbol) => max
    ? `${symbol}${convert(min, ratesFor(symbol)).toLocaleString()}–${convert(max, ratesFor(symbol)).toLocaleString()}`
    : `${symbol}${convert(min, ratesFor(symbol)).toLocaleString()}+`;

  function ratesFor(symbol) {
    if (symbol === "NZ$") return CONFIG.fx.nzdRate;
    if (symbol === "€") return CONFIG.fx.eurRate;
    if (symbol === "$") return CONFIG.fx.usdRate;
    return 1;
  }

  const nzd = fmt(band.zarMin, band.zarMax, "NZ$");
  const eur = fmt(band.zarMin, band.zarMax, "€");
  const usd = fmt(band.zarMin, band.zarMax, "$");

  return `${zar}  /  ${nzd}  /  ${eur}  /  ${usd}`;
}
