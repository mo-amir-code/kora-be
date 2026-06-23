import { env } from "../../config/index.js";
import type { DealCurrency } from "../../generated/client/enums.js";

const FRANKFURTER_USD_INR_RATE_URL = "https://api.frankfurter.dev/v2/rate/USD/INR";
const RATE_CACHE_TTL_MS = 60 * 60 * 1000;

type RateCache = {
  usdToInr: number;
  fetchedAt: number;
  source: "frankfurter" | "env";
};

type FrankfurterRateResponse = {
  rate?: unknown;
  rates?: {
    INR?: unknown;
  };
};

let rateCache: RateCache | null = null;

function fallbackRate(): RateCache {
  return {
    usdToInr: env.USD_TO_INR_RATE,
    fetchedAt: Date.now(),
    source: "env",
  };
}

function isFresh(cache: RateCache) {
  return Date.now() - cache.fetchedAt < RATE_CACHE_TTL_MS;
}

export async function getUsdToInrRate() {
  if (rateCache && isFresh(rateCache)) return rateCache;

  try {
    const response = await fetch(FRANKFURTER_USD_INR_RATE_URL, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) throw new Error(`Exchange rate API failed with ${response.status}`);

    const data = await response.json() as FrankfurterRateResponse;
    const rate = Number(data.rate ?? data.rates?.INR);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("Exchange rate API returned an invalid USD/INR rate");
    }

    rateCache = {
      usdToInr: rate,
      fetchedAt: Date.now(),
      source: "frankfurter",
    };
  } catch {
    rateCache = fallbackRate();
  }

  return rateCache;
}

export function convertCurrency(amount: number, source: DealCurrency, target: DealCurrency, usdToInr: number) {
  if (source === target) return amount;
  return source === "USD" ? amount * usdToInr : amount / usdToInr;
}
