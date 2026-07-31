// IEEE Xplore probe (10.1109/).
// Lesson: the PDF is embedded in a stamp.jsp page inside an <iframe> whose src
// is a getPDF.jsp URL. Fetch that src with credentials to get the PDF.
//
// Returns: { host, onStamp, arnumber, iframeSrc }
// last_verified: pending

export default {
  name: "ieee",
  description: "IEEE Xplore / stamp.jsp: detect stamp page + extract getPDF iframe src",
  build: () => String.raw`(() => {
    var host = location.hostname;
    var onStamp = /stamp\.jsp/i.test(location.href);
    var m = /arnumber=([0-9]+)/i.exec(location.href);
    var ar = m ? m[1] : null;
    var src = null;
    var ifs = document.querySelectorAll("iframe");
    for (var i = 0; i < ifs.length; i++) {
      var s = ifs[i].src || "";
      if (/getPDF\.jsp|stampPDF/i.test(s)) { src = s.slice(0, 200); break; }
    }
    return { host: host.slice(0, 40), onStamp: !!onStamp, arnumber: ar, iframeSrc: src };
  })()`,
};
