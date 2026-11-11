import axios from "axios";
import { TavilySearch } from "@langchain/tavily";
import type {
  Coordinates,
  CountryInfo,
  FlightSearchParams,
  LocationInfo,
} from "../types/flight.js";

const GEOCODING_BASE = "https://geocoding-api.open-meteo.com/v1/search";
/** FlagCDN — REST Countries v3 is deprecated; ISO codes map cleanly to FlagCDN. */
const FLAG_CDN = "https://flagcdn.com/w80";

const webSearch = new TavilySearch({
  maxResults: 5,
  topic: "general",
});

function flagUrlFromCountryCode(countryCode: string): string {
  return `${FLAG_CDN}/${countryCode.trim().toLowerCase()}.png`;
}

export async function searchFlights({
  origin,
  destination,
  date,
}: FlightSearchParams): Promise<string> {
  const query = date
    ? `cheap flights from ${origin} to ${destination} on ${date} USD prices flight numbers departure arrival dates`
    : `cheap flights from ${origin} to ${destination} USD prices airlines flight numbers departure arrival dates`;

  const results = await webSearch.invoke({ query });
  console.log(JSON.stringify(results));
  return typeof results === "string" ? results : JSON.stringify(results);
}

export async function fetchCoordinates(
  name: string
): Promise<Coordinates | null> {
  const { data } = await axios.get(GEOCODING_BASE, {
    params: {
      name: name.trim(),
      count: 1,
      language: "en",
      format: "json",
    },
  });

  const results = data.results;
  if (!results || results.length === 0) return null;

  const first = results[0];
  return {
    lat: first.latitude,
    lon: first.longitude,
    name: first.name,
    countryCode: first.country_code ?? undefined,
    country: first.country ?? undefined,
  };
}

/**
 * Resolve a country code or country name to flag + ISO code.
 * Prefer ISO alpha-2 from geocode_location / resolve_location.
 */
export async function fetchCountryFlag(
  countryCodeOrName: string
): Promise<CountryInfo | null> {
  const query = countryCodeOrName.trim();
  if (!query) return null;

  if (query.length <= 3) {
    const countryCode = query.toUpperCase();
    return {
      name: countryCode,
      countryCode,
      flag: flagUrlFromCountryCode(countryCode),
    };
  }

  // Country / place name → geocode to get ISO code, then FlagCDN
  const coords = await fetchCoordinates(query);
  if (!coords?.countryCode) return null;

  return {
    name: coords.country ?? coords.name,
    countryCode: coords.countryCode.toUpperCase(),
    flag: flagUrlFromCountryCode(coords.countryCode),
  };
}

/** Resolve a city/airport to coordinates, ISO country code, and flag URL. */
export async function resolveLocation(
  placeName: string
): Promise<LocationInfo | null> {
  // put here return null if you want to simluate fallback tools 
  const coords = await fetchCoordinates(placeName);
  if (!coords) return null;

  const countryCode = (coords.countryCode ?? "").toUpperCase();
  const country = coords.country ?? coords.name;
  const flag = countryCode ? flagUrlFromCountryCode(countryCode) : "";

  return {
    name: coords.name,
    lat: coords.lat,
    lon: coords.lon,
    countryCode,
    country,
    flag,
  };
}

/** Resolve multiple cities/airports in one call (e.g. origin + destination). */
export async function resolveLocations(
  placeNames: string[]
): Promise<Array<{ query: string; location: LocationInfo | null }>> {
  return Promise.all(
    placeNames.map(async (query) => ({
      query,
      location: await resolveLocation(query),
    }))
  );
}

export function convertUsdToNis(priceInDollar: string): string {
  const price = parseFloat(priceInDollar);
  if (isNaN(price)) {
    return "Invalid price. Please provide a numeric value in USD.";
  }
  const priceInNIS = Math.round(price * 3.5);
  return `${price} USD = ${priceInNIS} NIS/ILS`;
}

export function convertUsdToNisBulk(pricesInDollar: string[]): string {
  return pricesInDollar.map((price) => convertUsdToNis(price)).join("\n");
}
