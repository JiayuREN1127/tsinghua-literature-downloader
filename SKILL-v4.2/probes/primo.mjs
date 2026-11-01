// Primo (水木学术搜索) result-extraction probe.
// Lesson: skip empty href; SPA needs settle time; scope may default to paper-only
// (needs search_scope=default_scope). This probe returns compact candidate links.
//
// Returns: { host, scope, hasResults, fulltextLinks[] }
// last_verified: pending

export default {
  name: "primo",
  description: "Primo/Alma result page: extract fulltext/PDF candidate links + scope",
  build: () => String.raw`(() => {
    var scope = "";
    var m = /search_scope=([^&]+)/.exec(location.href);
    if (m) scope = decodeURIComponent(m[1]);
    var body = document.body ? document.body.innerText : "";
    var hasNoResults = /no results|无结果|没有找到|did not match/i.test(body.slice(0, 400));
    var out = [];
    var as = document.querySelectorAll("a");
    for (var i = 0; i < as.length && out.length < 8; i++) {
      var href = as[i].getAttribute("href") || "";
      var text = (as[i].textContent || "").replace(/\s+/g, " ").trim();
      if (!href) continue;
      if (/pdf|在线全文|fulltext|full text|view pdf|阅读全文|全文|getpdf|doi/i.test(text) || /fulltext|pdf|uresolver|view/i.test(href)) {
        out.push({ href: href.slice(0, 160), text: text.slice(0, 48) });
      }
    }
    return { host: location.hostname.slice(0, 40), scope: scope, hasResults: !hasNoResults && out.length > 0, fulltextLinks: out };
  })()`,
};
