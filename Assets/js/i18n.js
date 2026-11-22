// Idioma EN/ES compartido. Cada elemento traducible lleva el inglés como contenido
// y el español en data-es (y data-es-aria para aria-label). Inglés por defecto.
// Orden de elección: ?lang= en la URL > lo guardado al cambiar de página > "en".
(() => {
  const OK = ["en", "es"];
  let lang = new URLSearchParams(location.search).get("lang");
  if (!OK.includes(lang)) { try { lang = localStorage.getItem("lang"); } catch (e) {} }
  if (!OK.includes(lang)) lang = "en";

  function apply(l) {
    lang = l;
    document.documentElement.lang = l;
    document.querySelectorAll("[data-es]").forEach(el => {
      if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
      el.innerHTML = l === "es" ? el.dataset.es : el.dataset.en;
    });
    document.querySelectorAll("[data-es-aria]").forEach(el => {
      if (el.dataset.enAria === undefined) el.dataset.enAria = el.getAttribute("aria-label");
      el.setAttribute("aria-label", l === "es" ? el.dataset.esAria : el.dataset.enAria);
    });
    document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", b.dataset.l === l));
    try { localStorage.setItem("lang", l); } catch (e) {}
    document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
  }

  window.i18n = { get lang() { return lang; }, t: (en, es) => (lang === "es" ? es : en) };
  document.addEventListener("click", e => { const b = e.target.closest(".lang button"); if (b) apply(b.dataset.l); });
  apply(lang);
})();
