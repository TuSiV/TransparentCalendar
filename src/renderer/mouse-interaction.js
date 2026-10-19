(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MouseInteraction = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  const SELECTOR =
    "button,input,select,textarea,a,.day,.event,.checkbox,.del-btn,.resize-grip,#detailOverlay:not(.hidden),.add-bar:not(.hidden)";
  const isInteractive = (target) => !!target?.closest?.(SELECTOR);
  function setup({ document, window, api }) {
    let enabled = false,
      held = false,
      point = null,
      reported,
      revision = 0;
    function update() {
      if (!enabled) return;
      const target = point && document.elementFromPoint(point.x, point.y);
      const interactive = held || isInteractive(target);
      if (interactive !== reported) {
        reported = interactive;
        api.reportInteractive(interactive);
      }
    }
    function modeChanged(state) {
      enabled = state.enabled;
      point = state.point;
      held = false;
      reported = undefined;
      revision++;
      update();
    }
    api.onClickThroughChanged(modeChanged);
    const initialRevision = revision;
    api.getInteractionState().then((state) => {
      if (revision === initialRevision) modeChanged(state);
    });
    document.addEventListener(
      "mousemove",
      (event) => {
        point = { x: event.clientX, y: event.clientY };
        update();
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (enabled && isInteractive(event.target)) {
          held = true;
          update();
        }
      },
      true,
    );
    const released = (event) => {
      held = false;
      point = { x: event.clientX, y: event.clientY };
      update();
    };
    document.addEventListener("pointerup", released, true);
    document.addEventListener("pointercancel", released, true);
    document.documentElement.addEventListener("mouseleave", () => {
      point = null;
      update();
    });
    window.addEventListener("blur", () => {
      held = false;
      point = null;
      update();
    });
    // Dialogs and date rerenders can change hit-testing under a stationary mouse.
    new window.MutationObserver(update).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
    });
  }
  return { isInteractive, setup };
});
