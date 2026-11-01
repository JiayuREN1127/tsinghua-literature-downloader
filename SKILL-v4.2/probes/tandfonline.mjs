// Taylor & Francis probe (10.1080/).
// Lesson: shares the CAS pool; after SSO, fetch /doi/pdf/<DOI>?download=true.
// ssostart may trigger a Cloudflare JS Challenge that resolves in 10-30s.
//
// Args: doi (optional)
// Returns: { host, accessText, ssoStart, pdfUrl }
// last_verified: pending

export default {
  name: "tandfonline",
  description: "Taylor & Francis page: auth status + pdf download URL",
  build: (args) => {
    const doi = JSON.stringify(args.doi || "");
    return String.raw`(() => {
    var doi = ${doi};
    var body = document.body ? document.body.innerText : "";
    var access = /access through tsinghua|access through your institution|full access/i.test(body);
    var sso = null;
    var as = document.querySelectorAll("a");
    for (var i = 0; i < as.length; i++) {
      if (/ssostart|institutional login|sign in/i.test(as[i].href + " " + (as[i].textContent || ""))) { sso = (as[i].href || "").slice(0, 160); break; }
    }
    var pdf = doi ? location.origin + "/doi/pdf/" + doi + "?download=true" : "";
    return { host: location.hostname.slice(0, 40), accessText: !!access, ssoStart: sso, pdfUrl: pdf };
  })()`;
  },
};
