// Taylor & Francis (10.1080/). 2026-10-16 fetch returned article HTML;
// native navigation to /doi/pdf/<DOI>?download=true succeeded.
// arg: doi
// last_verified: 2026-10-16 (native endpoint, not v4 runner)

export default {
  name: "tandfonline",
  description: "Taylor & Francis: native direct-link download; fetch returned HTML in 2026-10-16 retest",
  build: (args) => {
    const doi = JSON.stringify(args.doi || "");
    return String.raw`(()=>{var doi=${doi};return {mode:"navigate-download",publisher:"tandfonline",url:doi?(location.origin+"/doi/pdf/"+doi+"?download=true"):null,found:!!doi};})()`;
  },
};
