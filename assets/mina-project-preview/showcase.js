(function () {
  if (new URLSearchParams(location.search).get('showcase') !== '1') return;
  var started = false;
  var userInteracted = false;
  addEventListener('pointerdown', function () { userInteracted = true; }, { once:true });
  addEventListener('wheel', function () { userInteracted = true; }, { once:true, passive:true });
  function run() {
    if (started) return;
    started = true;
    var cycle = 26000;
    var pause = 1200;
    var topPause = 600;
    var loop = cycle + pause + topPause;
    var start = performance.now() + 6000;
    function frame(now) {
      if (userInteracted) return;
      var t = (now - start) % loop;
      var max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      var y = 0;
      if (t > topPause && t <= cycle + topPause) {
        var p = (t - topPause) / cycle;
        y = max * (p * p * (3 - 2 * p));
      }
      window.scrollTo(0, y);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'complete') run();
  else addEventListener('load', run, { once:true });
})();
