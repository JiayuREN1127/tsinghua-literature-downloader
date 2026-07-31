// EBSCO probe (incl. INFORMS 10.1287/).
// Lesson: INFORMS lives in EBSCO Business Source Complete, not Primo. The PDF
// comes via a CDS signed URL that MUST be fetched WITHOUT credentials.
// This probe only reports page state; fetching is done by browser_pdf_downloader.
//
// Returns: { host, hasRecord, accessText, pdfButton, downloadModal }
// last_verified: pending

export default {
  name: "ebsco",
  description: "EBSCO (research.ebsco.com): record presence + PDF/download buttons",
  build: () => String.raw`(() => {
    var body = document.body ? document.body.innerText : "";
    var access = /access provided by.*tsinghua|清华大学|fulltext available/i.test(body);
    var pdfBtn = false, dl = false;
    var els = document.querySelectorAll("[aria-label], button, a, [data-auto]");
    for (var i = 0; i < els.length; i++) {
      var al = els[i].getAttribute("aria-label") || els[i].textContent || "";
      if (/立即获取|pdf|download|下载/i.test(al)) {
        if (/download|下载|bulk/i.test(els[i].getAttribute("data-auto") || al)) dl = true;
        else if (/pdf|立即获取/i.test(al)) pdfBtn = true;
      }
    }
    return { host: location.hostname.slice(0, 40), hasRecord: !/no results|no record|no record found/i.test(body.slice(0, 400)), accessText: !!access, pdfButton: !!pdfBtn, downloadModal: !!dl };
  })()`,
};
