export default {
  name: "royalsociety",
  description: "Royal Society: native download of article-matched article-pdf href",
  build: (args) => String.raw`(()=>{const doi=${JSON.stringify(args.doi || "")};const links=[...document.querySelectorAll("a[href]")].filter(a=>/\/article-pdf\//i.test(a.href)&&(!doi||decodeURIComponent(a.href).toLowerCase().includes(doi.toLowerCase())));const urls=[...new Set(links.map(a=>a.href))];return {mode:"navigate-download",publisher:"royalsociety",url:urls.length===1?urls[0]:null,found:urls.length===1};})()`,
};
