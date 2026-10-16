// Probe registry. Each probe module exports { name, description, build }.
// Add a new publisher probe by dropping a file here and importing it below.

import classifyPage from "./classify-page.mjs";
import primo from "./primo.mjs";
import sciencedirect from "./sciencedirect.mjs";
import ebsco from "./ebsco.mjs";
import wiley from "./wiley.mjs";
import proquest from "./proquest.mjs";
import sage from "./sage.mjs";
import tandfonline from "./tandfonline.mjs";
import jstor from "./jstor.mjs";
import annualreviews from "./annualreviews.mjs";
import ieee from "./ieee.mjs";
import nature from "./nature.mjs";

const PROBES = [
  classifyPage,
  primo,
  sciencedirect,
  ebsco,
  wiley,
  proquest,
  sage,
  tandfonline,
  jstor,
  annualreviews,
  ieee,
  nature,
];

const BY_NAME = new Map(PROBES.map((p) => [p.name, p]));

export function list() {
  return PROBES.map(({ name, description }) => ({ name, description }));
}

export function get(name) {
  return BY_NAME.get(name);
}
