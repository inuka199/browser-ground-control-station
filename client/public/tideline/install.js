export function setupInstallation({button,update,status,dialog,checkpoint}){
  let prompt,registration,allowButton=true,installed=window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  function showInstall(allowed){allowButton=allowed;button.hidden=installed||!allowed;}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;showInstall(allowButton);});
  window.addEventListener('appinstalled',()=>{installed=true;prompt=null;showInstall(allowButton);});
  button.addEventListener('click',async()=>{
    if(prompt){
      const event=prompt;prompt=null;
      try{await event.prompt();await event.userChoice;return;}catch{/* Browser menu remains available. */}
    }
    dialog('Install Tideline',['On Android, open the browser menu and choose Install app or Add to Home screen.',
      'On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen. You can also play here in the browser.']);
  });
  if(!('serviceWorker' in navigator) || !window.isSecureContext){
    status.textContent='Offline install needs HTTPS or localhost';return {showInstall};
  }
  const sw=navigator.serviceWorker;
  let controlled=!!sw.controller,reloading=false;
  sw.addEventListener('controllerchange',()=>{
    if(controlled && !reloading){reloading=true;checkpoint();location.reload();}
    controlled=true;
  });
  const readyUpdate=()=>{if(registration?.waiting && sw.controller) update.hidden=false;};
  update.addEventListener('click',()=>{if(registration?.waiting){checkpoint();registration.waiting.postMessage('ACTIVATE');}});
  status.textContent='Preparing offline play…';
  sw.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
    registration=reg;readyUpdate();
    function watch(){
      const worker=reg.installing;if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed' && sw.controller)update.hidden=false;
        if(worker.state==='redundant' && !reg.active)status.textContent='Offline download incomplete · reconnect and reload';
      });
    }
    watch();reg.addEventListener('updatefound',watch);
    let checked=Date.now();
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden && Date.now()-checked>60000){checked=Date.now();reg.update().catch(()=>{});}
    });
    return sw.ready;
  }).then(()=>{status.textContent='Available offline';readyUpdate();}).catch(()=>{status.textContent='Offline download unavailable';});
  return {showInstall};
}
