export default {
  name: "oxford",
  description: "Oxford Academic: native article-pdf link from the current article",
  build: () => String.raw`(()=>{const c=document.querySelector('meta[name="citation_pdf_url"]')?.content;const links=c?[c]:[...document.querySelectorAll('a.article-pdfLink,a.pdf-link,a[href*="/article-pdf/"]')].map(a=>a.href);const urls=[...new Set(links.filter(Boolean))];return {mode:"navigate-download",publisher:"oxford",url:urls.length===1?urls[0]:null,found:urls.length===1};})()`,
};
