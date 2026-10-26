import{a as p,b as n}from"./chunk-XCWASBLI.js";import{a as o}from"./chunk-7SEEBCS6.js";import{a as i,aa as d,b as l,ba as m,ca as u,ea as g,j as c}from"./chunk-5WCM36OM.js";import"./chunk-7NOAEGYN.js";import"./chunk-FY3BTKY4.js";var b="inphner.welcomed";function v(){try{return localStorage.getItem(b)!==null}catch{return!0}}function h(){try{localStorage.setItem(b,String(Date.now()))}catch{}}function f(){if(matchMedia("(display-mode: standalone)").matches||navigator.standalone===!0||!matchMedia("(pointer: coarse)").matches)return"";let t=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.userAgent.includes("Macintosh")&&navigator.maxTouchPoints>1?"In Safari, tap Share and then Add to Home Screen.":"Open the browser menu and pick Install app (or Add to Home screen).";return`
    <li>
      <span class="badge-ico tint-teal">${o("down",16)}</span>
      <div><strong>Want it on your home screen?</strong> ${t} It opens like an app after that, and works offline.</div>
    </li>`}function y(){return d().phase==="unconfigured"?`
    <li>
      <span class="badge-ico tint-orange">${o("lock",16)}</span>
      <div><strong>Your solves only live in this browser.</strong> Nothing gets uploaded, so back them up once in a
        while from Settings \u2192 Data. You'll get a reminder.</div>
    </li>`:`
    <li>
      <span class="badge-ico tint-orange">${o("lock",16)}</span>
      <div><strong>Your solves are saved in this browser.</strong> Sign in with Google to keep them the same on all your
        devices. They go in a hidden folder in your own Google Drive. You can also skip this and do it later in Settings.
        <button type="button" class="btn btn-sm" data-welcome="signin">Sign in with Google</button></div>
    </li>`}async function Y(r){if(v())return;try{if(await c("solves")>0){h();return}}catch{return}if(await new Promise(e=>{let s=()=>{r()||document.querySelector(".modal-backdrop")?setTimeout(s,1500):e()};setTimeout(s,700)}),v())return;h();let{root:a,close:t}=l({title:"Welcome to inphner",confirmLabel:"Got it",cancelLabel:"",bodyHtml:`
      <p class="welcome-lead">It's a free timer for speedcubing. You get WCA scrambles for every event, your averages
        and charts, and a trainer for PLL, OLL and F2L.</p>
      <ul class="welcome-list">
        <li>
          <span class="badge-ico tint-blue">${o("stack",16)}</span>
          <div><strong>Using csTimer?</strong> You can bring all your sessions over. It shows you what it found before
            anything gets saved.
            <button type="button" class="btn btn-sm" data-welcome="import">Import from csTimer</button></div>
        </li>
${y()}${f()}
      </ul>
      <div class="welcome-guides">
        <small>Guides, in a new tab</small>
        <div>${p.map(e=>`<a class="btn btn-sm" href="${n(e.slug)}" target="_blank" rel="noopener">${e.label}</a>`).join("")}</div>
        <small><a href="${n("privacy")}" target="_blank" rel="noopener">Privacy policy</a> \xB7 <a href="${n("terms")}" target="_blank" rel="noopener">Terms</a></small>
      </div>`});m(),a.querySelector('[data-welcome="signin"]')?.addEventListener("click",()=>{t(),u().then(()=>i("Signed in. Your solves now sync through Google Drive.",{kind:"good"}),e=>i(e.message,{kind:"bad"}))}),a.querySelector('[data-welcome="import"]')?.addEventListener("click",()=>{t(),g()})}export{Y as maybeWelcome};
//# sourceMappingURL=welcome-ZN4GYDUC.js.map
