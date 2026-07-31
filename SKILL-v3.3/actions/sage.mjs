// SAGE (10.1177/). Lesson: ONLY the China mirror sage.cnpereading.com works;
// journals.sagepub.com always 403s. PDF path is in the Next.js RSC <script> stream.
// last_verified: pending

export default {
  name: "sage",
  description: "SAGE: detect China mirror + plan fetch of RSC-embedded PDF path",
  build: () => String.raw`(()=>{var host=location.hostname;var onWrongSite=/sagepub\.com/i.test(host);var pdf=null;if(!onWrongSite){var ss=document.querySelectorAll("script");for(var i=0;i<ss.length;i++){var t=ss[i].textContent||"";var m=/\/storage\/sage\/journal\/[^"'\s]+\.pdf/i.exec(t);if(m){pdf=m[0];break;}}}return {mode:"fetch",publisher:"sage",url:pdf?(location.origin+pdf):null,method:"GET",credentials:"include",onWrongSite:onWrongSite,found:!!pdf};})()`,
};
