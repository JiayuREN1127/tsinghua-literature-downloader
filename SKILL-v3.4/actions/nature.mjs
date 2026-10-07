// Nature / Springer Nature (10.1038/). Lesson: MUST be logged in first, else
// "Download PDF" returns HTML disguised as .pdf. The page has ~3 download
// buttons (2 hidden sticky + 1 visible); only the visible one triggers a real
// NATIVE download to the user's download dir. This action clicks the visible
// button; the runner watches the download dir for the new file.
// last_verified: pending

export default {
  name: "nature",
  description: "Nature: click the visible Download PDF button -> native download to disk",
  build: () => String.raw`(()=>{var clicked=false;var btns=document.querySelectorAll("a.c-pdf-download__link, a[data-readcube-pdf-url]");for(var i=0;i<btns.length;i++){var r=btns[i].getBoundingClientRect();if(r.width>0&&r.height>0){try{btns[i].click();clicked=true;break;}catch(e){}}}return {mode:"click-download",publisher:"nature",clicked:clicked,found:clicked};})()`,
};
