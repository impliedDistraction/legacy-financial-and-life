document.addEventListener("DOMContentLoaded",function(){const s=document.querySelector("#contact form"),a=s?.querySelector('button[type="submit"]');if(!s||!a)return;a.textContent,s.addEventListener("submit",function(e){if(!c())return e.preventDefault(),!1;u(),m("form_submit","engagement","contact_form")}),s.querySelectorAll('input[required], input[type="email"]').forEach(e=>{e.addEventListener("blur",function(){o(this)}),e.addEventListener("input",function(){i(this)})});function c(){let e=!0;return s.querySelectorAll("input[required]").forEach(t=>{o(t)||(e=!1)}),e}function o(e){const r=e.value.trim();let t=!0,n="";return i(e),e.hasAttribute("required")&&!r?(t=!1,n="This field is required"):e.type==="email"&&r?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)||(t=!1,n="Please enter a valid email address"):e.name==="phone"&&r?/^[\+]?[1-9][\d\s\-\(\)\.]{8,15}$/.test(r)||(t=!1,n="Please enter a valid phone number"):e.name==="name"&&r&&r.length<2&&(t=!1,n="Name must be at least 2 characters long"),t||d(e,n),t}function d(e,r){e.classList.add("border-red-500","focus:border-red-500","focus:ring-red-200"),e.classList.remove("border-slate-300","focus:border-brand-500","focus:ring-brand-200");const t=document.createElement("div");t.className="text-sm text-red-600 mt-1 form-error-message",t.textContent=r;const n=e.closest("label")||e.parentElement;n&&n.appendChild(t)}function i(e){e.classList.remove("border-red-500","focus:border-red-500","focus:ring-red-200"),e.classList.add("border-slate-300","focus:border-brand-500","focus:ring-brand-200");const r=e.closest("label")||e.parentElement;if(r){const t=r.querySelector(".form-error-message");t&&t.remove()}}function u(e){a.disabled=!0,a.innerHTML=`
        <span class="flex items-center justify-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sending...
        </span>
      `,a.classList.add("opacity-75","cursor-not-allowed")}function m(e,r,t){typeof gtag<"u"&&gtag("event",e,{event_category:r,event_label:t}),console.log("Event tracked:",{action:e,category:r,label:t})}const l=document.createElement("style");l.textContent=`
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `,document.head.appendChild(l)});
