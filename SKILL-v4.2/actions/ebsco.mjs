// EBSCO (incl. INFORMS 10.1287/). Lesson: the CDS signed URL must be fetched
// WITHOUT credentials (credentials:"include" triggers a CORS preflight that
// fails). The CDS URL is observed in network entries after clicking download.
// v4 reads the viewer's existing resources; no click is required.
// last_verified: 2026-10-16 (live PDF hash matched)

export default {
  name: "ebsco",
  description: "EBSCO: fetch reader-observed CDS URL in page context, credentials omitted",
  build: () => String.raw`(async()=>{
    var ents=performance.getEntriesByType("resource");
    var cds=null;
    for(var j=ents.length-1;j>=0;j--){
      var n=ents[j].name||"";
      var m=/https?:\/\/[^\s"']*(?:\/cds\/retrieve\?|content\.ebscohost\.com\/cds)[^\s"']*/i.exec(n);
      if(m){cds=m[0];break;}
    }
    return {mode:"fetch",publisher:"ebsco",url:cds,method:"GET",credentials:"omit",found:!!cds,note:cds?"":"reader CDS resource not loaded; inspect within remaining budget"};
  })()`,
};
