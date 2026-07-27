// ProQuest / APA (10.1037/). Lesson: PDF renders via PDF.js inside an <iframe>;
// PDFViewerApplication.pdfDocument.getData() returns the bytes directly. Not a
// fetch. The runner reads the viewer object.
// last_verified: pending

export default {
  name: "proquest",
  description: "ProQuest: plan = pdfjs (read bytes from in-page PDF.js viewer)",
  build: () => String.raw`(()=>{var has=false;var ifs=document.querySelectorAll("iframe");for(var i=0;i<ifs.length;i++){try{if(ifs[i].contentWindow&&ifs[i].contentWindow.PDFViewerApplication){has=true;break;}}catch(e){}}return {mode:"pdfjs",publisher:"proquest",iframeSelector:"iframe",found:has};})()`,
};
