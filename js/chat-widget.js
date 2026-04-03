/**
 * Chat Agent Widget
 * Self-contained conversational assistant for nicolalorusso.ch.
 * Calls the Netlify Function at /api/chat (RAG-powered).
 */
(function () {
  "use strict";

  var API = "/api/chat";
  var history = [];
  var open = false;

  function el(id) { return document.getElementById(id); }

  // ── build DOM ────────────────────────────────────────────

  function mount() {
    var w = document.createElement("div");
    w.id = "chat-agent";
    w.innerHTML =
      '<button id="chat-toggle" aria-label="Open chat assistant">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
        "</svg>" +
      "</button>" +
      '<div id="chat-panel" class="chat-hidden">' +
        '<div id="chat-header">' +
          "<span>Ask about this site</span>" +
          '<button id="chat-close" aria-label="Close chat">\u00d7</button>' +
        "</div>" +
        '<div id="chat-messages">' +
          '<div class="chat-msg assistant">' +
            "<p>Hi! I can answer questions about Nicola\u2019s blog posts, projects, and background. What would you like to know?</p>" +
          "</div>" +
        "</div>" +
        '<form id="chat-form">' +
          '<input id="chat-input" type="text" placeholder="Ask something\u2026" autocomplete="off" />' +
          '<button type="submit" id="chat-send" aria-label="Send">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<line x1="22" y1="2" x2="11" y2="13"/>' +
              '<polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
            "</svg>" +
          "</button>" +
        "</form>" +
      "</div>";
    document.body.appendChild(w);

    el("chat-toggle").addEventListener("click", toggle);
    el("chat-close").addEventListener("click", toggle);
    el("chat-form").addEventListener("submit", onSubmit);
  }

  // ── toggle ───────────────────────────────────────────────

  function toggle() {
    open = !open;
    el("chat-panel").classList.toggle("chat-hidden", !open);
    el("chat-toggle").classList.toggle("chat-open", open);
    if (open) el("chat-input").focus();
  }

  // ── helpers ──────────────────────────────────────────────

  function esc(text) {
    var d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function postUrl(id) {
    if (id === "__cv__") return "cv.html";
    var loc = window.location.pathname;
    if (loc.indexOf("/posts/") !== -1) return id + ".html";
    return "posts/" + id + ".html";
  }

  function addMsg(text, role, sources) {
    var wrap = el("chat-messages");
    var div = document.createElement("div");
    div.className = "chat-msg " + role;

    var html = "<p>" + esc(text) + "</p>";
    if (sources && sources.length) {
      html += '<div class="chat-sources">';
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        html +=
          '<a href="' + postUrl(s.id) + '" class="chat-source-link">' +
          esc(s.title) + "</a>";
      }
      html += "</div>";
    }
    div.innerHTML = html;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function showLoader() {
    var wrap = el("chat-messages");
    var d = document.createElement("div");
    d.className = "chat-msg assistant";
    d.id = "chat-loader";
    d.innerHTML =
      '<div class="chat-dots"><span></span><span></span><span></span></div>';
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function hideLoader() {
    var ld = el("chat-loader");
    if (ld) ld.remove();
  }

  function setInputEnabled(enabled) {
    el("chat-input").disabled = !enabled;
    el("chat-send").disabled = !enabled;
  }

  // ── submit ───────────────────────────────────────────────

  function onSubmit(e) {
    e.preventDefault();
    var input = el("chat-input");
    var msg = input.value.trim();
    if (!msg) return;

    input.value = "";
    addMsg(msg, "user");
    showLoader();
    setInputEnabled(false);

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, history: history }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        hideLoader();
        if (data.error) {
          addMsg("Sorry, something went wrong. Please try again.", "assistant");
        } else {
          addMsg(data.reply, "assistant", data.sources);
          history.push({ role: "user", content: msg });
          history.push({ role: "assistant", content: data.reply });
          if (history.length > 12) history = history.slice(-12);
        }
      })
      .catch(function () {
        hideLoader();
        addMsg(
          "Sorry, I couldn\u2019t connect. Please try again later.",
          "assistant"
        );
      })
      .finally(function () {
        setInputEnabled(true);
        el("chat-input").focus();
      });
  }

  // ── init ─────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
