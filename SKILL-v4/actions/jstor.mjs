// JSTOR (10.2307/). Lesson: "Access provided by 清华大学"; PDF at /stable/pdf/{id}.pdf.
// last_verified: pending

export default {
  name: "jstor",
  description: "JSTOR: click T&C shadow button for native download",
  build: () => String.raw`(()=>{const b=document.querySelector("terms-and-conditions-pharos-button")?.shadowRoot?.querySelector("button");if(b)b.click();return {mode:"click-download",publisher:"jstor",found:!!b,clicked:!!b};})()`,
};
