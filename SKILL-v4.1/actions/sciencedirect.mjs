// v4.1: use the article's actual PII-matched View PDF link for native download.
// Do not click here: the runner snapshots Downloads and opens a dedicated tab.
// arg: pii (e.g. S0001879110002083)
// last_verified: 2026-10-16 (native navigation live; new-tab runner covered by tests)

export default {
  name: "sciencedirect",
  description: "ScienceDirect: actual PII-matched PDF link -> native download in new tab",
  build: (args) => {
    const pii = JSON.stringify((args.pii || "").toUpperCase());
    return String.raw`(()=>{var pii=${pii};var as=document.querySelectorAll("a");for(var i=0;i<as.length;i++){var text=(as[i].textContent||"").replace(/\s/g," ").trim();var href=as[i].href||"";if(/view pdf/i.test(text)&&(!pii||href.toUpperCase().indexOf(pii)!==-1)){return {mode:"navigate-download",publisher:"sciencedirect",url:href,found:true};}}return {publisher:"sciencedirect",found:false};})()`;
  },
};
