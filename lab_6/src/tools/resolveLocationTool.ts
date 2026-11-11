import { tool } from "@langchain/core/tools";
import { resolveLocationSchema } from "../schemas/flightSearchSchema.js";
import { resolveLocations } from "../services/flightApiService.js";

export const resolveLocationTool = tool(
  async ({ placeNames }) => {
    const results = await resolveLocations(placeNames);
    const locations = results.map(({ query, location }) => {
      if (!location) {
        return { query, error: `Could not resolve location "${query}"` };
      }
      return { query, ...location };
    });
    return JSON.stringify({ locations });
  },
  {
    name: "resolve_location",
    description:
      "Resolve one or more cities/airports into map-ready data in a single call: name, lat, lon, countryCode, country, and flag image URL. Prefer this over calling geocode_location and get_country_flag separately. Pass BOTH departure and destination in placeNames together—do not call once per city.",
    schema: resolveLocationSchema,
  }
);
