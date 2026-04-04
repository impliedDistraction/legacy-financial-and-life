import 'cookie';
import 'kleur/colors';
import { N as NOOP_MIDDLEWARE_FN } from './chunks/astro-designed-error-pages_CZRWRCb2.mjs';
import 'es-module-lexer';
import { g as decodeKey } from './chunks/astro/server_DbiBHzOX.mjs';
import 'clsx';

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///home/runner/work/legacy-financial-and-life/legacy-financial-and-life/","adapterName":"@astrojs/vercel/serverless","routes":[{"file":"consultation-success/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/consultation-success","isIndex":false,"type":"page","pattern":"^\\/consultation-success\\/?$","segments":[[{"content":"consultation-success","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/consultation-success.astro","pathname":"/consultation-success","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"estate-planning/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/estate-planning","isIndex":false,"type":"page","pattern":"^\\/estate-planning\\/?$","segments":[[{"content":"estate-planning","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/estate-planning.astro","pathname":"/estate-planning","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"event-success/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/event-success","isIndex":false,"type":"page","pattern":"^\\/event-success\\/?$","segments":[[{"content":"event-success","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/event-success.astro","pathname":"/event-success","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"form-error/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/form-error","isIndex":false,"type":"page","pattern":"^\\/form-error\\/?$","segments":[[{"content":"form-error","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/form-error.astro","pathname":"/form-error","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"form-success/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/form-success","isIndex":false,"type":"page","pattern":"^\\/form-success\\/?$","segments":[[{"content":"form-success","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/form-success.astro","pathname":"/form-success","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"free-quote/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/free-quote","isIndex":false,"type":"page","pattern":"^\\/free-quote\\/?$","segments":[[{"content":"free-quote","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/free-quote.astro","pathname":"/free-quote","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"hiring/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/hiring","isIndex":false,"type":"page","pattern":"^\\/hiring\\/?$","segments":[[{"content":"hiring","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/hiring.astro","pathname":"/hiring","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"quote-success/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/quote-success","isIndex":false,"type":"page","pattern":"^\\/quote-success\\/?$","segments":[[{"content":"quote-success","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/quote-success.astro","pathname":"/quote-success","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"rsvp/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/rsvp","isIndex":false,"type":"page","pattern":"^\\/rsvp\\/?$","segments":[[{"content":"rsvp","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/rsvp.astro","pathname":"/rsvp","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"schedule/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/schedule","isIndex":false,"type":"page","pattern":"^\\/schedule\\/?$","segments":[[{"content":"schedule","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/schedule.astro","pathname":"/schedule","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"wills-trusts-event/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/wills-trusts-event","isIndex":false,"type":"page","pattern":"^\\/wills-trusts-event\\/?$","segments":[[{"content":"wills-trusts-event","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/wills-trusts-event.astro","pathname":"/wills-trusts-event","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":true,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.V2R8AmkL.js"}],"styles":[],"routeData":{"type":"endpoint","isIndex":false,"route":"/_image","pattern":"^\\/_image$","segments":[[{"content":"_image","dynamic":false,"spread":false}]],"params":[],"component":"node_modules/astro/dist/assets/endpoint/generic.js","pathname":"/_image","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"/_astro/page.V2R8AmkL.js"}],"styles":[],"routeData":{"route":"/api/fb-lead","isIndex":false,"type":"endpoint","pattern":"^\\/api\\/fb-lead\\/?$","segments":[[{"content":"api","dynamic":false,"spread":false}],[{"content":"fb-lead","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/api/fb-lead.ts","pathname":"/api/fb-lead","prerender":false,"fallbackRoutes":[],"_meta":{"trailingSlash":"ignore"}}}],"site":"https://legacyfinancial.app","base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/consultation-success.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/estate-planning.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/event-success.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/form-error.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/form-success.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/free-quote.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/hiring.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/index.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/quote-success.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/rsvp.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/schedule.astro",{"propagation":"none","containsHead":true}],["/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/src/pages/wills-trusts-event.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(o,t)=>{let i=async()=>{await(await o())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var s=(i,t)=>{let a=async()=>{await(await i())()};if(t.value){let e=matchMedia(t.value);e.matches?a():e.addEventListener(\"change\",a,{once:!0})}};(self.Astro||(self.Astro={})).media=s;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var l=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let a of e)if(a.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=l;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","\u0000noop-middleware":"_noop-middleware.mjs","\u0000@astrojs-ssr-virtual-entry":"entry.mjs","\u0000@astro-renderers":"renderers.mjs","\u0000@astro-page:src/pages/api/fb-lead@_@ts":"pages/api/fb-lead.astro.mjs","\u0000@astro-page:src/pages/consultation-success@_@astro":"pages/consultation-success.astro.mjs","\u0000@astro-page:src/pages/estate-planning@_@astro":"pages/estate-planning.astro.mjs","\u0000@astro-page:src/pages/event-success@_@astro":"pages/event-success.astro.mjs","\u0000@astro-page:src/pages/form-error@_@astro":"pages/form-error.astro.mjs","\u0000@astro-page:src/pages/form-success@_@astro":"pages/form-success.astro.mjs","\u0000@astro-page:src/pages/free-quote@_@astro":"pages/free-quote.astro.mjs","\u0000@astro-page:src/pages/hiring@_@astro":"pages/hiring.astro.mjs","\u0000@astro-page:src/pages/quote-success@_@astro":"pages/quote-success.astro.mjs","\u0000@astro-page:src/pages/rsvp@_@astro":"pages/rsvp.astro.mjs","\u0000@astro-page:src/pages/wills-trusts-event@_@astro":"pages/wills-trusts-event.astro.mjs","\u0000@astro-page:src/pages/schedule@_@astro":"pages/schedule.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astro-page:node_modules/astro/dist/assets/endpoint/generic@_@js":"pages/_image.astro.mjs","/home/runner/work/legacy-financial-and-life/legacy-financial-and-life/node_modules/astro/dist/env/setup.js":"chunks/astro/env-setup_Cr6XTFvb.mjs","\u0000@astrojs-manifest":"manifest_CtgenMt_.mjs","/astro/hoisted.js?q=0":"_astro/hoisted.DrK4fnp-.js","/astro/hoisted.js?q=1":"_astro/hoisted.CjOxoEcr.js","/astro/hoisted.js?q=2":"_astro/hoisted.CWH2vfkv.js","/astro/hoisted.js?q=3":"_astro/hoisted.BG56q80u.js","/astro/hoisted.js?q=4":"_astro/hoisted.CejY3ALt.js","/astro/hoisted.js?q=5":"_astro/hoisted.Di_vwDyu.js","/astro/hoisted.js?q=6":"_astro/hoisted.CIuSjs-B.js","/astro/hoisted.js?q=7":"_astro/hoisted.DTO3KJvt.js","/astro/hoisted.js?q=9":"_astro/hoisted.CZ4gKisZ.js","astro:scripts/page.js":"_astro/page.V2R8AmkL.js","/astro/hoisted.js?q=8":"_astro/hoisted.DYVzsaiE.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[],"assets":["/_astro/estate-planning.BYEAR0oO.css","/favicon.ico","/favicon.svg","/og-image.jpg","/_astro/hoisted.CIuSjs-B.js","/_astro/hoisted.DTO3KJvt.js","/_astro/hoisted.DYVzsaiE.js","/_astro/hoisted.Di_vwDyu.js","/_astro/page.V2R8AmkL.js","/scripts/animations.js","/images/LYFL_Mike_Morice_2025-09-11.jpg","/images/LYFL_Mo_Dadkhah_2025-09-11.jpg","/images/LYFL_Tim_and_Beth_Bryd_2025-09-11.jpeg","/images/README.md","/images/fb-carriers.jpg","/images/fb-crest-logo.jpeg","/images/image-mapping.json","/images/logo.bmp","/images/logo.png","/images/logo.svg","/images/professional-image-of-both-beth-and-tim-1200w-1200w.jpg","/images/professional-image-of-both-beth-and-tim-1200w-1200w.webp","/images/professional-image-of-both-beth-and-tim-1200w-400w.jpg","/images/professional-image-of-both-beth-and-tim-1200w-400w.webp","/images/professional-image-of-both-beth-and-tim-1200w-800w.jpg","/images/professional-image-of-both-beth-and-tim-1200w-800w.webp","/images/professional-image-of-both-beth-and-tim-1200w.jpg","/images/professional-image-of-both-beth-and-tim-1200w.webp","/images/professional-image-of-both-beth-and-tim-400w-1200w.jpg","/images/professional-image-of-both-beth-and-tim-400w-1200w.webp","/images/professional-image-of-both-beth-and-tim-400w-400w.jpg","/images/professional-image-of-both-beth-and-tim-400w-400w.webp","/images/professional-image-of-both-beth-and-tim-400w-800w.jpg","/images/professional-image-of-both-beth-and-tim-400w-800w.webp","/images/professional-image-of-both-beth-and-tim-400w.jpg","/images/professional-image-of-both-beth-and-tim-400w.webp","/images/professional-image-of-both-beth-and-tim-800w-1200w.jpg","/images/professional-image-of-both-beth-and-tim-800w-1200w.webp","/images/professional-image-of-both-beth-and-tim-800w-400w.jpg","/images/professional-image-of-both-beth-and-tim-800w-400w.webp","/images/professional-image-of-both-beth-and-tim-800w-800w.jpg","/images/professional-image-of-both-beth-and-tim-800w-800w.webp","/images/professional-image-of-both-beth-and-tim-800w.jpg","/images/professional-image-of-both-beth-and-tim-800w.webp","/images/professional-image-of-both-beth-and-tim.png","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w-1200w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w-1200w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w-400w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w-400w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w-800w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w-800w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-1200w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w-1200w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w-1200w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w-400w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w-400w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w-800w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w-800w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-400w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w-1200w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w-1200w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w-400w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w-400w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w-800w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w-800w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w.jpg","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy-800w.webp","/images/stock-image-elderly-man-kissing-elderly-woman-smiling-happy.jpeg","/_astro/page.V2R8AmkL.js","/consultation-success/index.html","/estate-planning/index.html","/event-success/index.html","/form-error/index.html","/form-success/index.html","/free-quote/index.html","/hiring/index.html","/quote-success/index.html","/rsvp/index.html","/schedule/index.html","/wills-trusts-event/index.html","/index.html"],"buildFormat":"directory","checkOrigin":false,"serverIslandNameMap":[],"key":"6j/zqAxbG26YH+oQEf8HFLxI4Z/a97VlGoYr7j1M0DM=","experimentalEnvGetSecretEnabled":false});

export { manifest };
