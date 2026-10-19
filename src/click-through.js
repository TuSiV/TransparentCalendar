function createClickThrough({ apply, notify = () => {} }) {
  let enabled = false;
  let interactive = false;
  let applied;
  function update() {
    const ignore = enabled && !interactive;
    if (ignore !== applied) {
      apply(ignore);
      applied = ignore;
    }
  }
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = !!value;
      interactive = false;
      update();
      notify(enabled);
    },
    setInteractive(value) {
      interactive = !!value;
      update();
    },
    refresh() {
      applied = undefined;
      update();
    },
  };
}
module.exports = { createClickThrough };
