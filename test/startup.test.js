const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({ platform = 'win32', portable, packaged = true, accepts = true } = {}) {
  let enabled = false, latest;
  const app = {
    isPackaged: packaged,
    getAppPath: () => 'C:\\source\\calendar',
    getLoginItemSettings: (options) => { latest = options; return { openAtLogin: enabled }; },
    setLoginItemSettings: (options) => { latest = options; if (accepts) enabled = options.openAtLogin; },
  };
  const context = { require: () => ({ app }), module: { exports: {} }, process: { platform, execPath: 'C:\\app\\TransparentCalendar.exe', env: portable ? { PORTABLE_EXECUTABLE_FILE: portable } : {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/startup.js'), 'utf8'), context);
  return { api: context.module.exports, options: () => latest };
}

test('Windows startup can be enabled and disabled for installed executable', () => {
  const { api, options } = fixture();
  assert.equal(api.getStartupSettings().startOnLogin, false);
  api.setStartupEnabled(true);
  assert.equal(api.getStartupSettings().startOnLogin, true);
  assert.equal(options().path, 'C:\\app\\TransparentCalendar.exe');
  assert.equal(options().args.length, 0);
  api.setStartupEnabled(false);
  assert.equal(api.getStartupSettings().startOnLogin, false);
});

test('portable startup uses original launcher rather than temporary executable', () => {
  const { api, options } = fixture({ portable: 'D:\\My Apps\\TransparentCalendar.exe' });
  api.setStartupEnabled(true);
  assert.equal(options().path, 'D:\\My Apps\\TransparentCalendar.exe');
  assert.equal(options().args.length, 0);
});

test('development startup passes the app directory', () => {
  const { api, options } = fixture({ packaged: false });
  api.setStartupEnabled(true);
  assert.equal(options().args[0], 'C:\\source\\calendar');
});

test('unsupported systems and failed registrations are reported', () => {
  const unsupported = fixture({ platform: 'linux' }).api;
  assert.equal(unsupported.getStartupSettings().startupSupported, false);
  assert.throws(() => unsupported.setStartupEnabled(true));
  assert.throws(() => fixture().api.setStartupEnabled('true'));
  assert.throws(() => fixture({ accepts: false }).api.setStartupEnabled(true), /未生效/);
});
