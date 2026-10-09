const { app } = require('electron');

// The portable launcher extracts Electron into a temporary folder. Register the
// original executable, not the extracted process.execPath.
function loginOptions() {
  return {
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  };
}

function getStartupSettings() {
  const startupSupported = process.platform === 'win32';
  return {
    startupSupported,
    startOnLogin: startupSupported && app.getLoginItemSettings(loginOptions()).openAtLogin,
  };
}

function setStartupEnabled(enabled) {
  if (process.platform !== 'win32') throw new Error('开机启动选项仅支持 Windows');
  if (typeof enabled !== 'boolean') throw new Error('开机启动选项无效');
  app.setLoginItemSettings({ ...loginOptions(), openAtLogin: enabled });
  if (getStartupSettings().startOnLogin !== enabled) throw new Error('开机启动设置未生效，请重试');
}

module.exports = { getStartupSettings, setStartupEnabled };
