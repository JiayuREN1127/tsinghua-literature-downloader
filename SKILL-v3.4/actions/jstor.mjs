// JSTOR (10.2307/). Lesson: "Access provided by 清华大学"; PDF at /stable/pdf/{id}.pdf.
// last_verified: pending

export default {
  name: "jstor",
  description: "JSTOR: plan = fetch /stable/pdf/{id}.pdf",
  build: () => String.raw`(()=>{var m=/\/stable\/([0-9]+)/.exec(location.pathname)||/jstor\.org\/stable\/([0-9]+)/.exec(location.href);var id=m?m[1]:null;return {mode:"fetch",publisher:"jstor",url:id?(location.origin+"/stable/pdf/"+id+".pdf"):null,method:"GET",credentials:"include",found:!!id};})()`,
};
