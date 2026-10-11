import{a as c,b as d}from"./chunk-XCWASBLI.js";import{a as t}from"./chunk-7SEEBCS6.js";import{aa as l,b as i,j as s}from"./chunk-OHTVOEWH.js";import"./chunk-7NOAEGYN.js";import"./chunk-FY3BTKY4.js";var p="inphner.welcomed";function m(){try{return localStorage.getItem(p)!==null}catch{return!0}}function u(){try{localStorage.setItem(p,String(Date.now()))}catch{}}function g(){if(matchMedia("(display-mode: standalone)").matches||navigator.standalone===!0||!matchMedia("(pointer: coarse)").matches)return"";let o=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.userAgent.includes("Macintosh")&&navigator.maxTouchPoints>1?"In Safari, tap Share and then Add to Home Screen.":"Open the browser menu and pick Install app (or Add to Home screen).";return`
    <li>
      <span class="badge-ico tint-teal">${t("down",16)}</span>
      <div><strong>Want it on your home screen?</strong> ${o} It opens like an app after that, and works offline.</div>
    </li>`}async function y(n){if(m())return;try{if(await s("solves")>0){u();return}}catch{return}if(await new Promise(e=>{let r=()=>{n()||document.querySelector(".modal-backdrop")?setTimeout(r,1500):e()};setTimeout(r,700)}),m())return;u();let{root:a,close:o}=i({title:"Welcome to inphner",confirmLabel:"Got it",cancelLabel:"",bodyHtml:`
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
        <div>${c.map(e=>`<a class="btn btn-sm" href="${d(e.slug)}" target="_blank" rel="noopener">${e.label}</a>`).join("")}</div>
      </div>`});a.querySelector('[data-welcome="import"]')?.addEventListener("click",()=>{o(),l()})}export{y as maybeWelcome};
//# sourceMappingURL=welcome-FTY6DZ5I.js.map
