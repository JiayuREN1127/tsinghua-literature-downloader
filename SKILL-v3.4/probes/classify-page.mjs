// Combined page-state probe. One /eval returns the page's classification plus
// any candidate PDF links — replaces several separate exploratory evals.
//
// Returns a compact object, never raw page text:
//   { stage, access, cloudflare, captcha, cas, host, pdfLinks[] }
// stage ∈ blank | search | article | pdf | cas | cloudflare | captcha | unknown
// pdfLinks: up to 5 { href, text } with bounded lengths.
//
// last_verified: pending (validate against live pages in the canary pass)

export default {
  name: "classifyPage",
  description: "Combined probe: stage + access + cloudflare/captcha + pdf link candidates",
  build: () => String.raw`(() => {
    var url = location.href, host = location.hostname || "", title = (document.title || "").slice(0, 80);
    var body = document.body ? document.body.innerText : "";
    var t = function(rx){ return rx.test(body); };
    var cloudflare = t(/checking your browser|just a moment|checking if the site connection is secure|正在检查浏览器|正在进行安全验证|正在安全验证/i);
    var captcha = t(/captcha|verify you are human|are you a robot|select all images|turnstile|人机验证|安全验证/i);
    var cas = t(/统一身份认证|Tsinghua University.*CAS|Central Authentication Service/) || /\/\/(idp\.tsinghua|login\.tsinghua)/i.test(url) || /cas\.tsinghua/i.test(url);
    var access = t(/brought to you by.*tsinghua|access through tsinghua|access provided by.*tsinghua|清华大学|full access via your institution|fulltext available|full access/i);
    var isPdfView = /\.pdf(\?|$)/i.test(url) || /pdf\.(sciencedirectassets|ebscohost)|pdfviewer|pdf\.js/i.test(host);
    var isSearch = /primo|alma\.exlibrisgroup|search/i.test(host) && !access;
    var stage = "unknown";
    if (!url || url === "about:blank") stage = "blank";
    else if (cloudflare) stage = "cloudflare";
    else if (captcha) stage = "captcha";
    else if (isPdfView) stage = "pdf";
    else if (cas) stage = "cas";
    else if (isSearch) stage = "search";
    else if (/article|journal|doi|stable|document|content/i.test(host) || /view pdf|download pdf|全文|full text/i.test(body.slice(0, 600))) stage = "article";
    var links = [];
    var as = document.querySelectorAll("a");
    for (var i = 0; i < as.length && links.length < 5; i++) {
      var href = as[i].getAttribute("href") || "";
      if (!href) continue;
      var abs = href;
      try { abs = new URL(href, location.origin).href; } catch (e) {}
      if (/pdf|fulltext|full text|getpdf|pdfdirect|download|在线全文|阅读全文/i.test(abs) || /pdf|fulltext|全文/i.test(as[i].textContent || "")) {
        links.push({ href: abs.slice(0, 160), text: (as[i].textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) });
      }
    }
    return { stage: stage, access: !!access, cloudflare: !!cloudflare, captcha: !!captcha, cas: !!cas, host: host.slice(0, 40), pdfLinks: links };
  })()`,
};
