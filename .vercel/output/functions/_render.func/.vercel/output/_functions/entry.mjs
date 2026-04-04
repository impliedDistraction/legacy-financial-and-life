import { renderers } from './renderers.mjs';
import { c as createExports } from './chunks/entrypoint_Bo7FIrra.mjs';
import { manifest } from './manifest_CtgenMt_.mjs';

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/api/fb-lead.astro.mjs');
const _page2 = () => import('./pages/consultation-success.astro.mjs');
const _page3 = () => import('./pages/estate-planning.astro.mjs');
const _page4 = () => import('./pages/event-success.astro.mjs');
const _page5 = () => import('./pages/form-error.astro.mjs');
const _page6 = () => import('./pages/form-success.astro.mjs');
const _page7 = () => import('./pages/free-quote.astro.mjs');
const _page8 = () => import('./pages/hiring.astro.mjs');
const _page9 = () => import('./pages/quote-success.astro.mjs');
const _page10 = () => import('./pages/rsvp.astro.mjs');
const _page11 = () => import('./pages/schedule.astro.mjs');
const _page12 = () => import('./pages/wills-trusts-event.astro.mjs');
const _page13 = () => import('./pages/index.astro.mjs');

const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/generic.js", _page0],
    ["src/pages/api/fb-lead.ts", _page1],
    ["src/pages/consultation-success.astro", _page2],
    ["src/pages/estate-planning.astro", _page3],
    ["src/pages/event-success.astro", _page4],
    ["src/pages/form-error.astro", _page5],
    ["src/pages/form-success.astro", _page6],
    ["src/pages/free-quote.astro", _page7],
    ["src/pages/hiring.astro", _page8],
    ["src/pages/quote-success.astro", _page9],
    ["src/pages/rsvp.astro", _page10],
    ["src/pages/schedule.astro", _page11],
    ["src/pages/wills-trusts-event.astro", _page12],
    ["src/pages/index.astro", _page13]
]);
const serverIslandMap = new Map();
const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "middlewareSecret": "c1238a13-4158-41ba-ace5-684c3d4f7079",
    "skewProtection": false
};
const _exports = createExports(_manifest, _args);
const __astrojsSsrVirtualEntry = _exports.default;

export { __astrojsSsrVirtualEntry as default, pageMap };
