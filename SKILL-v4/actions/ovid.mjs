export default {
  name: "ovid",
  description: "Ovid: click the article PDF button",
  build: () => String.raw`(()=>{const b=document.querySelector("button.omni-article-tool__pdf");if(b)b.click();return {mode:"click-download",publisher:"ovid",clicked:!!b,found:!!b};})()`,
};
