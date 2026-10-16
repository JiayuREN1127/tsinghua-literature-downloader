// IEEE Xplore (10.1109/). Lesson: the PDF lives in a stamp.jsp page inside an
// <iframe src="getPDF.jsp?...">. Fetch that src with credentials. The agent must
// already have navigated to stamp.jsp before running this action.
// last_verified: pending

export default {
  name: "ieee",
  description: "IEEE stamp.jsp: plan = fetch the getPDF iframe src",
  build: () => String.raw`(()=>{var src=null;var ifs=document.querySelectorAll("iframe");for(var i=0;i<ifs.length;i++){var s=ifs[i].src||"";if(/getPDF\.jsp|stampPDF/i.test(s)){src=s;break;}}return {mode:"fetch",publisher:"ieee",url:src,method:"GET",credentials:"include",onStamp:/stamp\.jsp/i.test(location.href),found:!!src};})()`,
};
