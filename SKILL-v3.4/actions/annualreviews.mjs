// Annual Reviews (10.1146/). Lesson: PDF download is a <form method="POST"
// action="/deliver/fulltext/..."> — GET returns HTML. Must POST.
// last_verified: pending

export default {
  name: "annualreviews",
  description: "Annual Reviews: plan = POST deliver/fulltext form action",
  build: () => String.raw`(()=>{var html=document.documentElement.outerHTML||"";var m=/action="([^"]*\/deliver\/fulltext\/[^"]*\.pdf[^"]*)"/i.exec(html);var action=m?m[1]:null;return {mode:"fetch",publisher:"annualreviews",url:action,method:"POST",credentials:"include",found:!!action};})()`,
};
