// Annual Reviews probe (10.1146/).
// Lesson: PDF download is a <form method="POST" action="/deliver/fulltext/...">
// — a plain GET returns HTML, not the PDF. Shibboleth WAYF is a native
// select/option, not a React list.
//
// Returns: { host, accessProvided, deliverAction }
// deliverAction: the POST form action to use with fetch(url, {method:"POST"}).
// last_verified: pending

export default {
  name: "annualreviews",
  description: "Annual Reviews page: access status + POST deliver/fulltext form action",
  build: () => String.raw`(() => {
    var body = document.body ? document.body.innerText : "";
    var access = /access provided by.*tsinghua|access provided by: tsinghua/i.test(body);
    var action = null;
    var html = document.documentElement.outerHTML || "";
    var m = /action="([^"]*\/deliver\/fulltext\/[^"]*\.pdf[^"]*)"/i.exec(html);
    if (m) action = m[1].slice(0, 200);
    return { host: location.hostname.slice(0, 40), accessProvided: !!access, deliverAction: action };
  })()`,
};
