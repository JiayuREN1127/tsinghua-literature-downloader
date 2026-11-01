// Endpoint manually verified; live automated canary required.
export default {
  name: "aua",
  description: "AUA Journals: native DOI PDF endpoint (not epdf viewer)",
  build: (args) => String.raw`(()=>{const doi=${JSON.stringify(args.doi || "")};return {mode:"navigate-download",publisher:"aua",url:doi?"https://www.auajournals.org/doi/pdf/"+doi+"?download=true":null,found:!!doi};})()`,
};
