import{a as d,b as o}from"./chunk-XCWASBLI.js";import{a as t}from"./chunk-7SEEBCS6.js";import{b as s,ca as c,j as l}from"./chunk-6ROFOYCU.js";import"./chunk-7NOAEGYN.js";import"./chunk-FY3BTKY4.js";var p="inphner.welcomed";function m(){try{return localStorage.getItem(p)!==null}catch{return!0}}function u(){try{localStorage.setItem(p,String(Date.now()))}catch{}}function g(){if(matchMedia("(display-mode: standalone)").matches||navigator.standalone===!0||!matchMedia("(pointer: coarse)").matches)return"";let n=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.userAgent.includes("Macintosh")&&navigator.maxTouchPoints>1?"In Safari, tap Share and then Add to Home Screen.":"Open the browser menu and pick Install app (or Add to Home screen).";return`
    <li>
      <span class="badge-ico tint-teal">${t("down",16)}</span>
      <div><strong>Want it on your home screen?</strong> ${n} It opens like an app after that, and works offline.</div>
    </li>`}async function w(a){if(m())return;try{if(await l("solves")>0){u();return}}catch{return}if(await new Promise(e=>{let i=()=>{a()||document.querySelector(".modal-backdrop")?setTimeout(i,1500):e()};setTimeout(i,700)}),m())return;u();let{root:r,close:n}=s({title:"Welcome to inphner",confirmLabel:"Got it",cancelLabel:"",bodyHtml:`
      <p class="welcome-lead">It's a free timer for speedcubing. You get WCA scrambles for every event, your averages
        and charts, and a trainer for PLL, OLL and F2L.</p>
      <ul class="welcome-list">
        <li>
          <span class="badge-ico tint-blue">${t("stack",16)}</span>
          <div><strong>Using csTimer?</strong> You can bring all your sessions over. It shows you what it found before
            anything gets saved.
            <button type="button" class="btn btn-sm" data-welcome="import">Import from csTimer</button></div>
        </li>
        <li>
          <span class="badge-ico tint-orange">${t("lock",16)}</span>
          <div><strong>Your solves only live in this browser.</strong> Nothing gets uploaded, so back them up once in a
            while from Settings \u2192 Data. You'll get a reminder.</div>
        </li>${g()}
      </ul>
      <div class="welcome-guides">
        <small>Guides, in a new tab</small>
        <div>${d.map(e=>`<a class="btn btn-sm" href="${o(e.slug)}" target="_blank" rel="noopener">${e.label}</a>`).join("")}</div>
        <small><a href="${o("privacy")}" target="_blank" rel="noopener">Privacy policy</a> \xB7 <a href="${o("terms")}" target="_blank" rel="noopener">Terms</a></small>
      </div>`});r.querySelector('[data-welcome="import"]')?.addEventListener("click",()=>{n(),c()})}export{w as maybeWelcome};
//# sourceMappingURL=welcome-YNUZ2ELF.js.map
