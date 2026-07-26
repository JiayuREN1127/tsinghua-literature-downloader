// ScienceDirect probe (10.1016/).
// Lesson: match "View PDF" by article PII to avoid grabbing reference-section
// links; check "Brought to you by Tsinghua"; signed S3 URL expires in 5 min.
//
// Args: pii (optional, e.g. S0001879110002083) — when given, each View PDF link
// is flagged with matchesPii.
// Returns: { host, broughtToYouBy, accessThroughLink, pii, viewPdfLinks[] }
// last_verified: pending

export default {
  name: "sciencedirect",
  description: "ScienceDirect article page: access status + PII-matched View PDF links",
  build: (args) => {
    const pii = JSON.stringify((args.pii || "").toUpperCase());
    return String.raw`(() => {
    var pii = ${pii};
    var body = document.body ? document.body.innerText : "";
    var brought = /brought to you by.*tsinghua/i.test(body);
    var out = [];
    var as = document.querySelectorAll("a");
    for (var i = 0; i < as.length && out.length < 6; i++) {
      var text = (as[i].textContent || "").replace(/\s+/g, " ").trim();
      if (text === "View PDF" || /view pdf/i.test(text)) {
        var href = as[i].href || "";
        out.push({ href: href.slice(0, 160), matchesPii: pii ? href.toUpperCase().indexOf(pii) !== -1 : null });
      }
    }
    var accessThrough = null;
    for (var j = 0; j < as.length; j++) {
      if (/access through tsinghua|access through your institution/i.test(as[j].textContent || "")) { accessThrough = as[j].href || true; break; }
    }
    return { host: location.hostname.slice(0, 40), broughtToYouBy: !!brought, accessThroughLink: accessThrough ? String(accessThrough).slice(0, 160) : null, pii: pii || null, viewPdfLinks: out };
  })()`;
  },
};
