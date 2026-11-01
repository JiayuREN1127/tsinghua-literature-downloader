// ProQuest / APA probe (10.1037/).
// Lesson: Alma resolver is first choice; ProQuest renders PDF via PDF.js inside
// an iframe (PDFViewerApplication exposed on iframe.contentWindow). docview IDs
// must be discovered dynamically, never hardcoded.
//
// Returns: { host, accessProvided, fulltextPdfUrl, hasPdfJsIframe }
// last_verified: pending

export default {
  name: "proquest",
  description: "ProQuest/APA page: access status + fulltextPDF link + PDF.js iframe detection",
  build: () => String.raw`(() => {
    var body = document.body ? document.body.innerText : "";
    var access = /access provided by.*tsinghua|access through.*tsinghua|清华大学/i.test(body);
    var full = "";
    var hasIframe = false;
    var as = document.querySelectorAll("a");
    for (var i = 0; i < as.length; i++) {
      var href = as[i].href || "";
      if (/fulltextPDF/i.test(href)) { full = href.slice(0, 160); break; }
    }
    var ifs = document.querySelectorAll("iframe");
    for (var j = 0; j < ifs.length; j++) {
      try {
        if (ifs[j].contentWindow && ifs[j].contentWindow.PDFViewerApplication) { hasIframe = true; break; }
      } catch (e) {}
    }
    return { host: location.hostname.slice(0, 40), accessProvided: !!access, fulltextPdfUrl: full || null, hasPdfJsIframe: !!hasIframe };
  })()`,
};
