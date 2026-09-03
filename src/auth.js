const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { PublicClientApplication } = require('@azure/msal-node');

const SCOPES = ['User.Read', 'Calendars.Read', 'Tasks.ReadWrite', 'offline_access'];

const clients = new Map();

function cachePlugin() {
  const cachePath = path.join(app.getPath('userData'), 'msal-cache.json');
  return {
    beforeCacheAccess: async (ctx) => {
      try {
        ctx.tokenCache.deserialize(await fs.promises.readFile(cachePath, 'utf-8'));
      } catch {
        /* 首次运行无缓存 */
      }
    },
    afterCacheAccess: async (ctx) => {
      if (ctx.cacheHasChanged) {
        await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.promises.writeFile(cachePath, ctx.tokenCache.serialize());
      }
    },
  };
}

function getClient(clientId) {
  if (!clients.has(clientId)) {
    clients.set(
      clientId,
      new PublicClientApplication({
        auth: {
          clientId,
          authority: 'https://login.microsoftonline.com/common',
        },
        cache: { cachePlugin: cachePlugin() },
      })
    );
  }
  return clients.get(clientId);
}

async function getSignedInAccount(clientId) {
  if (!clientId) return null;
  try {
    const accounts = await getClient(clientId).getTokenCache().getAllAccounts();
    return accounts[0] || null;
  } catch {
    return null;
  }
}

async function login(clientId, onDeviceCode) {
  const client = getClient(clientId);
  return new Promise((resolve, reject) => {
    client
      .acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: (resp) => onDeviceCode(resp),
      })
      .then((result) => resolve(result))
      .catch((err) => reject(err));
  });
}

async function getToken(clientId, account) {
  const client = getClient(clientId);
  const result = await client.acquireTokenSilent({
    account,
    scopes: ['User.Read', 'Calendars.Read', 'Tasks.ReadWrite'],
  });
  return result.accessToken;
}

async function logout(clientId) {
  const client = getClient(clientId);
  const account = await getSignedInAccount(clientId);
  if (account) await client.getTokenCache().removeAccount(account);
}

module.exports = { login, logout, getToken, getSignedInAccount };
