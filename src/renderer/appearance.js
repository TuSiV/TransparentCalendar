/* Shared appearance for the transparent calendar and the opaque settings window. */
(function () {
  const media = matchMedia("(prefers-color-scheme: dark)");
  let current = {};
  function apply(settings) {
    current = settings;
    const theme =
      settings.theme === "system"
        ? media.matches
          ? "dark"
          : "light"
        : settings.theme || "dark";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.clear = String(
      settings.backgroundMode !== "solid" && settings.backgroundOpacity === 0,
    );
    root.classList.toggle("text-enhance", !!settings.textEnhance);
    root.style.setProperty(
      "--panel-alpha",
      settings.backgroundMode === "solid"
        ? 1
        : (settings.backgroundOpacity ?? 50) / 100,
    );
    root.style.setProperty("--font-scale", settings.fontScale || 1);
    root.style.setProperty("--accent", settings.accent || "#60a5fa");
  }
  media.addEventListener("change", () => apply(current));
  window.applyAppearance = apply;
})();
