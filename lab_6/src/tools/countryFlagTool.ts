import { tool } from "@langchain/core/tools";
import { countryFlagSchema } from "../schemas/flightSearchSchema.js";
import { fetchCountryFlag } from "../services/flightApiService.js";

export const countryFlagTool = tool(
  async ({ countryCodeOrName }) => {
    const info = await fetchCountryFlag(countryCodeOrName);
    if (!info?.flag) {
      return JSON.stringify({
        error: `No flag found for "${countryCodeOrName}"`,
      });
    }
    return JSON.stringify(info);
  },
  {
    name: "get_country_flag",
    description:
      "Look up a country flag image URL from an ISO country code (e.g. IL, JP) or country name. Prefer the countryCode returned by geocode_location or resolve_location. Use for both origin and destination so flags appear on the map.",
    schema: countryFlagSchema,
  }
);
