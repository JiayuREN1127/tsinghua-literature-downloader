// Nature / Springer Nature probe (10.1038/).
// Lesson: MUST be logged in first, otherwise "Download PDF" returns an HTML file
// disguised as .pdf (silent false success). The page has ~3 download buttons
// (2 hidden sticky-header + 1 visible); only the visible one triggers a real
// download. Use JS .click() on the visible button, not CDP /clickAt.
//
// Returns: { host, fullAccess, downloadPdfUrls[], visibleCount }
// downloadPdfUrls: each { href, visible } — pick the one with visible:true.
// last_verified: pending

export default {
  name: "nature",
  description: "Nature page: login status + visible Download PDF buttons (filter hidden sticky)",
  build: () => String.raw`(() => {
    var body = document.body ? document.body.innerText : "";
    var access = /full access.*via your institution|access through.*tsinghua|清华大学/i.test(body);
    var links = [];
    var set = document.querySelectorAll("a.c-pdf-download__link, a[href$=\".pdf\"], a[data-readcube-pdf-url]");
    set.forEach(function (a) {
      var r = a.getBoundingClientRect();
      var visible = r.width > 0 && r.height > 0;
      var href = a.href || a.getAttribute("data-readcube-pdf-url") || "";
      if (href) links.push({ href: href.slice(0, 160), visible: !!visible });
    });
    return { host: location.hostname.slice(0, 40), fullAccess: !!access, downloadPdfUrls: links.slice(0, 5), visibleCount: links.filter(function (x) { return x.visible; }).length };
  })()`,
};
