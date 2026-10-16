// SAGE probe (10.1177/).
// Lesson: Tsinghua's SAGE access is ONLY on the China mirror
// sage.cnpereading.com — journals.sagepub.com always 403s. The PDF path is
// embedded in Next.js RSC <script> stream, not in __NEXT_DATA__.
//
// Returns: { host, isChinaMirror, pdfPath, onWrongSite }
// If onWrongSite is true, the agent should redirect to sage.cnpereading.com.
// last_verified: pending

export default {
  name: "sage",
  description: "SAGE page: detect China mirror + extract PDF path from RSC script stream",
  build: () => String.raw`(() => {
    var host = location.hostname;
    var isChina = /cnpereading\.com/i.test(host);
    var onWrongSite = /sagepub\.com/i.test(host);
    var pdfPath = null;
    if (isChina) {
      var ss = document.querySelectorAll("script");
      for (var i = 0; i < ss.length; i++) {
        var t = ss[i].textContent || "";
        var m = /\/storage\/sage\/journal\/[^"'\s]+\.pdf/i.exec(t);
        if (m) { pdfPath = m[0].slice(0, 200); break; }
      }
    }
    return { host: host.slice(0, 40), isChinaMirror: !!isChina, pdfPath: pdfPath, onWrongSite: !!onWrongSite };
  })()`,
};
