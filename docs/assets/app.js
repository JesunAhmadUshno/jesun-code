/* Jesun.Code site interactions: hero terminal typing, install tabs,
   copy buttons, scroll reveal, stat counters, nav state, mobile menu. */
(function () {
  "use strict";

  /* ---------- hero terminal typing ---------- */
  var termBody = document.getElementById("termBody");
  if (termBody) {
    var script = [
      { t: "cmd", s: "$ jesun hello.jc" },
      { t: "code", s: "ask \"What is your name? \" giving name" },
      { t: "out", s: "What is your name? Jesun" },
      { t: "code", s: "" },
      { t: "code", s: "repeat 3 times" },
      { t: "code", s: "    show \"Go, {name}!\"" },
      { t: "out", s: "Go, Jesun!" },
      { t: "out", s: "Go, Jesun!" },
      { t: "out", s: "Go, Jesun!" },
      { t: "cmd", s: "$ " }
    ];
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function esc(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function highlight(line) {
      return esc(line)
        .replace(/(&quot;.*?&quot;|".*?")/g, "<span class=\"st\">$1</span>")
        .replace(/\b(ask|giving|repeat|times|show|if|then|otherwise|to|give|back|import|agent|for|each|in)\b/g, "<span class=\"kw\">$1</span>");
    }
    var si = 0;
    function playLine() {
      if (si >= script.length) {
        setTimeout(function () { termBody.innerHTML = ""; si = 0; playLine(); }, 7000);
        return;
      }
      var item = script[si++];
      var div = document.createElement("div");
      if (item.t === "cmd") div.innerHTML = "<span class=\"prompt\">" + esc(item.s) + "</span>";
      else if (item.t === "out") div.innerHTML = "<span class=\"out\">" + esc(item.s) + "</span>";
      else div.innerHTML = item.s === "" ? "&nbsp;" : highlight(item.s);
      if (item.t === "cmd" && item.s === "$ ") {
        div.innerHTML = "<span class=\"prompt\">$ </span><span class=\"caret\"></span>";
        termBody.appendChild(div);
        return; /* park on the prompt */
      }
      if (item.t === "code" && !reduced) {
        /* typewriter for code lines */
        div.innerHTML = "";
        termBody.appendChild(div);
        var chars = item.s.split("");
        var ci = 0;
        var iv = setInterval(function () {
          ci++;
          div.innerHTML = highlight(chars.slice(0, ci).join("")) + "<span class=\"caret\"></span>";
          if (ci >= chars.length) {
            clearInterval(iv);
            div.innerHTML = highlight(item.s);
            setTimeout(playLine, item.s === "" ? 250 : 420);
          }
        }, 26);
      } else {
        termBody.appendChild(div);
        setTimeout(playLine, item.t === "cmd" ? 700 : 380);
      }
    }
    setTimeout(playLine, 900);
  }

  /* ---------- install tabs ---------- */
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
      tab.classList.add("active");
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    });
  });

  /* ---------- copy buttons ---------- */
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.dataset.copy;
      function done() {
        var old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = old; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta); done();
      }
    });
  });

  /* ---------- scroll reveal ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  /* ---------- stat counters ---------- */
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target, target = parseInt(el.dataset.count, 10);
      cio.unobserve(el);
      var start = null;
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / 1100);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach(function (el) { cio.observe(el); });

  /* ---------- nav state + mobile menu ---------- */
  var nav = document.getElementById("nav");
  if (nav) {
    window.addEventListener("scroll", function () {
      nav.classList.toggle("scrolled", window.scrollY > 24);
    }, { passive: true });
  }
  var toggle = document.getElementById("navToggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
})();
