// Taylor & Francis (10.1080/). Lesson: shares CAS pool; after SSO fetch
// /doi/pdf/<DOI>?download=true. ssostart may show a Cloudflare JS Challenge.
// arg: doi
// last_verified: pending

export default {
  name: "tandfonline",
  description: "Taylor & Francis: plan = fetch /doi/pdf/<DOI>?download=true",
  build: (args) => {
    const doi = JSON.stringify(args.doi || "");
    return String.raw`(()=>{var doi=${doi};return {mode:"fetch",publisher:"tandfonline",url:doi?(location.origin+"/doi/pdf/"+doi+"?download=true"):null,method:"GET",credentials:"include",found:!!doi};})()`;
  },
};
