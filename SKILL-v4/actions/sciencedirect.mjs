// ScienceDirect (10.1016/). Lesson: "View PDF" (PII-matched) opens a NEW tab
// with a time-limited presigned S3 URL on pdf.sciencedirectassets.com. We must
// fetch FROM that new tab (cross-origin to the article). This action clicks the
// PII-matched View PDF link; the runner then finds the new tab and fetches it.
// arg: pii (e.g. S0001879110002083)
// last_verified: pending

export default {
  name: "sciencedirect",
  description: "ScienceDirect: click PII-matched View PDF -> newtab-fetch the presigned S3 tab",
  build: (args) => {
    const pii = JSON.stringify((args.pii || "").toUpperCase());
    return String.raw`(()=>{var pii=${pii};var clicked=false;var as=document.querySelectorAll("a");for(var i=0;i<as.length;i++){var text=(as[i].textContent||"").replace(/\s/g," ").trim();var href=as[i].href||"";if((text==="View PDF"||/view pdf/i.test(text))&&(!pii||href.toUpperCase().indexOf(pii)!==-1)){try{as[i].click();clicked=true;break;}catch(e){}}}return {mode:"newtab-fetch",publisher:"sciencedirect",newTabHostContains:"sciencedirectassets",credentials:"include",clicked:clicked,found:clicked};})()`;
  },
};
