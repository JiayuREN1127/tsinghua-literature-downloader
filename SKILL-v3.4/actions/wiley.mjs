// Wiley (10.1002/, 10.1111/). Lesson: use pdfdirect (not pdf) from the article
// page's OWN origin (subdomain cookies don't share). ?download=true => full bytes.
// arg: doi
// last_verified: pending

export default {
  name: "wiley",
  description: "Wiley: plan = fetch pdfdirect from page origin",
  build: (args) => {
    const doi = JSON.stringify(args.doi || "");
    return String.raw`(()=>{var doi=${doi};return {mode:"fetch",publisher:"wiley",url:doi?(location.origin+"/doi/pdfdirect/"+doi+"?download=true"):null,method:"GET",credentials:"include",found:!!doi};})()`;
  },
};
