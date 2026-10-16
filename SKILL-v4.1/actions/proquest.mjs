// 2026-10-16: PFT anchor click verified; do not scrape the PDF.js viewer.
export default {
  name: "proquest",
  description: "ProQuest: click the media.proquest.com PFT PDF anchor",
  build: () => String.raw`(()=>{const a=[...document.querySelectorAll("a[href]")].find(a=>/media\.proquest\.com\/media\/hms\/PFT\//i.test(a.href));if(a)a.click();return {mode:"click-download",publisher:"proquest",found:!!a,clicked:!!a};})()`,
};
