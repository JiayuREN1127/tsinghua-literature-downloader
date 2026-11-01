export default {
  name: "springer",
  description: "Springer: native DOI PDF direct link",
  build: (args) => String.raw`(()=>{const doi=${JSON.stringify(args.doi || "")};return {mode:"navigate-download",publisher:"springer",url:doi?"https://link.springer.com/content/pdf/"+doi+".pdf":null,found:!!doi};})()`,
};
