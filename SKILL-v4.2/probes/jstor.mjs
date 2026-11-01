// JSTOR probe (10.2307/).
// Lesson: "Access provided by 清华大学"; PDF URL pattern /stable/pdf/{jstorID}.pdf.
//
// Returns: { host, accessProvided, jstorId, pdfUrl }
// last_verified: pending

export default {
  name: "jstor",
  description: "JSTOR page: access status + /stable/pdf/{id}.pdf URL",
  build: () => String.raw`(() => {
    var body = document.body ? document.body.innerText : "";
    var access = /access provided by.*清华|access provided by.*tsinghua|清华大学/i.test(body);
    var idm = /\/stable\/([0-9]+)/.exec(location.pathname) || /jstor\.org\/stable\/([0-9]+)/.exec(location.href);
    var id = idm ? idm[1] : null;
    return { host: location.hostname.slice(0, 40), accessProvided: !!access, jstorId: id, pdfUrl: id ? (location.origin + "/stable/pdf/" + id + ".pdf") : null };
  })()`,
};
