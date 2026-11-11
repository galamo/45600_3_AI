import { flightSearchTool } from "./flightSearchTool.js";
import { geocodeLocationTool } from "./geocodeLocationTool.js";
import { countryFlagTool } from "./countryFlagTool.js";
import { resolveLocationTool } from "./resolveLocationTool.js";
import { currencyExchangeTool } from "./currencyExchangeTool.js";



export const agentTools = [
  flightSearchTool,
  currencyExchangeTool,
  resolveLocationTool,
  geocodeLocationTool,
  countryFlagTool,
];

export {
  flightSearchTool,
  geocodeLocationTool,
  countryFlagTool,
  resolveLocationTool,
  currencyExchangeTool
};
