// Wiley probe (10.1002/, 10.1111/).
// Lesson: use pdfdirect (not pdf); subdomain cookies don't share with main site,
// so the pdfdirect URL must be built from the article page's own origin. The
// "Full Access" / "Access through Tsinghua" indicator confirms auth.
//
// Args: doi (optional, e.g. 10.1002/job.1234)
// Returns: { host, origin, accessThrough, fullAccess, pdfDirectUrl }
// last_verified: pending

export default {
  name: "wiley",
  description: "Wiley article page: auth status + pdfdirect URL built from page origin",
  build: (args) => {
    const doi = JSON.stringify(args.doi || "");
    return String.raw`(() => {
    var doi = ${doi};
    var body = document.body ? document.body.innerText : "";
    var access = /access through tsinghua|access through your institution/i.test(body);
    var full = /full access/i.test(body);
    var origin = location.origin;
    var pdf = "";
    if (doi) pdf = origin + "/doi/pdfdirect/" + doi + "?download=true";
    return { host: location.hostname.slice(0, 40), origin: origin, accessThrough: !!access, fullAccess: !!full, pdfDirectUrl: pdf };
  })()`;
  },
};
