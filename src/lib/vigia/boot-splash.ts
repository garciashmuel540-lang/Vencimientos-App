/** Sin tiempo mínimo: un único desvanecimiento al terminar la carga real. */
export function dismissBootSplash() {
  const el = document.getElementById("vigia-boot");
  if (!el || el.classList.contains("done")) return;

  el.classList.add("done");
  el.setAttribute("aria-hidden", "true");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.remove();
    return;
  }
  // El respaldo también limpia el nodo si el navegador omite transitionend.
  const timeout = window.setTimeout(() => el.remove(), 200);
  el.addEventListener("transitionend", () => {
    window.clearTimeout(timeout);
    el.remove();
  }, { once: true });
}
