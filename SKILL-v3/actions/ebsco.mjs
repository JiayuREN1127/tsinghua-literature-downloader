// EBSCO (incl. INFORMS 10.1287/). Lesson: the CDS signed URL must be fetched
// WITHOUT credentials (credentials:"include" triggers a CORS preflight that
// fails). The CDS URL is observed in network entries after clicking download.
// This action triggers the download API and reads performance entries.
// last_verified: pending

export default {
  name: "ebsco",
  description: "EBSCO: trigger download API, plan = fetch observed CDS url with NO credentials",
  build: () => String.raw`(async()=>{
    var btn=null;
    var els=document.querySelectorAll("[data-auto],[aria-label],button,a");
    for(var i=0;i<els.length;i++){
      var da=els[i].getAttribute("data-auto")||"";
      var al=els[i].getAttribute("aria-label")||(els[i].textContent||"");
      if(/bulk-download-modal-download-button/i.test(da)||/^download$/i.test(al)||/下载/.test(al)){btn=els[i];break;}
    }
    var before=performance.getEntriesByType("resource").length;
    if(btn){try{btn.click();}catch(e){}}
    await new Promise(function(r){setTimeout(r,3000);});
    var ents=performance.getEntriesByType("resource").slice(before);
    var cds=null;
    for(var j=0;j<ents.length;j++){
      var n=ents[j].name||"";
      var m=/https?:\/\/[^\s"']*(?:\/cds\/retrieve\?|content\.ebscohost\.com\/cds)[^\s"']*/i.exec(n);
      if(m){cds=m[0];break;}
    }
    return {mode:"fetch",publisher:"ebsco",url:cds,method:"GET",credentials:"omit",clicked:!!btn,found:!!cds,note:cds?"":"no CDS url observed after click (may need modal option selection)"};
  })()`,
};
