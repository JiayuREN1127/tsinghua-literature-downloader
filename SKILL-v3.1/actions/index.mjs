// Action registry. Each action module exports { name, description, build }.
// build(args) returns a JS string (IIFE) that runs in the authenticated article
// page and returns a compact FETCH PLAN — never the bytes, never page content.
//
// Plan schema (all fields optional except mode):
//   {
//     mode: "fetch" | "newtab-fetch" | "click-download" | "pdfjs",
//     url?: string,                 // fetch / newtab-fetch target (absolute)
//     method?: "GET" | "POST",      // default GET
//     credentials?: "include"|"omit", // default "include"
//     newTabHostContains?: string,  // newtab-fetch: match the popped tab by host
//     clicked?: boolean,            // newtab-fetch / click-download: did the action click?
//     found?: boolean,              // whether a target element was found
//     onWrongSite?: boolean,        // e.g. SAGE on sagepub.com — abort & redirect
//     onStamp?: boolean,            // IEEE: are we on stamp.jsp?
//     publisher?: string,
//     note?: string
//   }
//
// The plan-runner (scripts/get-pdf.mjs) executes the plan. Per-publisher
// knowledge lives HERE (one place); the runner stays generic.

import wiley from "./wiley.mjs";
import jstor from "./jstor.mjs";
import tandfonline from "./tandfonline.mjs";
import sage from "./sage.mjs";
import annualreviews from "./annualreviews.mjs";
import ebsco from "./ebsco.mjs";
import sciencedirect from "./sciencedirect.mjs";
import ieee from "./ieee.mjs";
import proquest from "./proquest.mjs";
import nature from "./nature.mjs";

const ACTIONS = [
  wiley,
  jstor,
  tandfonline,
  sage,
  annualreviews,
  ebsco,
  sciencedirect,
  ieee,
  proquest,
  nature,
];

const BY_NAME = new Map(ACTIONS.map((a) => [a.name, a]));

export function list() {
  return ACTIONS.map(({ name, description }) => ({ name, description }));
}

export function get(name) {
  return BY_NAME.get(name);
}
