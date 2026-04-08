(function(){
  window.quGo = function(page, hash){
    const target = '/' + String(page).replace(/\.html$/,'') + '.html';
    window.location.href = hash ? (target + '#' + hash) : target;
  };
  window.quOpenHub = function(){ window.location.href = '/index.html'; };
  window.quOpenCockpit = function(section){ window.location.href = section ? ('/cockpit.html#' + section) : '/cockpit.html'; };
  window.quOpenScan = function(section){ window.location.href = section ? ('/app.html#' + section) : '/app.html'; };
  window.addEventListener('pageshow', function(e){ if (e.persisted && document.body) document.body.classList.add('qu-pageshow-restore'); });
})();