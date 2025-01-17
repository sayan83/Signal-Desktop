// Copyright 2018-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* global window */

const { ipcRenderer, remote } = require('electron');

const url = require('url');
const i18n = require('./js/modules/i18n');
const {
  getEnvironment,
  setEnvironment,
  parseEnvironment,
} = require('./ts/environment');

const config = url.parse(window.location.toString(), true).query;
const { locale } = config;
const localeMessages = ipcRenderer.sendSync('locale-data');
setEnvironment(parseEnvironment(config.environment));

const { nativeTheme } = remote.require('electron');

const { Context: SignalContext } = require('./ts/context');

window.SignalContext = new SignalContext();

window.platform = process.platform;
window.theme = config.theme;
window.i18n = i18n.setup(locale, localeMessages);
window.appStartInitialSpellcheckSetting =
  config.appStartInitialSpellcheckSetting === 'true';

function setSystemTheme() {
  window.systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

setSystemTheme();

window.subscribeToSystemThemeChange = fn => {
  nativeTheme.on('updated', () => {
    setSystemTheme();
    fn();
  });
};

window.getEnvironment = getEnvironment;
window.getVersion = () => config.version;
window.getAppInstance = () => config.appInstance;

// So far we're only using this for Signal.Types
const Signal = require('./js/modules/signal');

window.Signal = Signal.setup({
  Attachments: null,
  userDataPath: null,
  getRegionCode: () => null,
});

window.closeSettings = () => ipcRenderer.send('close-settings');

window.getDeviceName = makeGetter('device-name');

window.getThemeSetting = makeGetter('theme-setting');
window.setThemeSetting = makeSetter('theme-setting');
window.getHideMenuBar = makeGetter('hide-menu-bar');
window.setHideMenuBar = makeSetter('hide-menu-bar');

window.getSpellCheck = makeGetter('spell-check');
window.setSpellCheck = makeSetter('spell-check');

window.getAutoLaunch = makeGetter('auto-launch');
window.setAutoLaunch = makeSetter('auto-launch');

window.getAlwaysRelayCalls = makeGetter('always-relay-calls');
window.setAlwaysRelayCalls = makeSetter('always-relay-calls');

window.getNotificationSetting = makeGetter('notification-setting');
window.setNotificationSetting = makeSetter('notification-setting');
window.getNotificationDrawAttention = makeGetter('notification-draw-attention');
window.setNotificationDrawAttention = makeSetter('notification-draw-attention');
window.getAudioNotification = makeGetter('audio-notification');
window.setAudioNotification = makeSetter('audio-notification');
window.getCallRingtoneNotification = makeGetter('call-ringtone-notification');
window.setCallRingtoneNotification = makeSetter('call-ringtone-notification');
window.getCallSystemNotification = makeGetter('call-system-notification');
window.setCallSystemNotification = makeSetter('call-system-notification');
window.getIncomingCallNotification = makeGetter('incoming-call-notification');
window.setIncomingCallNotification = makeSetter('incoming-call-notification');
window.getCountMutedConversations = makeGetter(
  'badge-count-muted-conversations'
);
window.setCountMutedConversations = makeSetter(
  'badge-count-muted-conversations'
);

window.getMediaPermissions = makeGetter('media-permissions');
window.setMediaPermissions = makeSetter('media-permissions');
window.getMediaCameraPermissions = makeGetter('media-camera-permissions');
window.setMediaCameraPermissions = makeSetter('media-camera-permissions');

window.isPrimary = makeGetter('is-primary');
window.makeSyncRequest = makeGetter('sync-request');
window.getLastSyncTime = makeGetter('sync-time');
window.setLastSyncTime = makeSetter('sync-time');
window.getUniversalExpireTimer = makeGetter('universal-expire-timer');
window.setUniversalExpireTimer = makeSetter('universal-expire-timer');

window.deleteAllData = () => ipcRenderer.send('delete-all-data');

function makeGetter(name) {
  return () =>
    new Promise((resolve, reject) => {
      ipcRenderer.once(`get-success-${name}`, (event, error, value) => {
        if (error) {
          return reject(error);
        }

        return resolve(value);
      });
      ipcRenderer.send(`get-${name}`);
    });
}

function makeSetter(name) {
  return value =>
    new Promise((resolve, reject) => {
      ipcRenderer.once(`set-success-${name}`, (event, error) => {
        if (error) {
          return reject(error);
        }

        return resolve();
      });
      ipcRenderer.send(`set-${name}`, value);
    });
}

window.Backbone = require('backbone');
window.React = require('react');
window.ReactDOM = require('react-dom');

require('./ts/backbone/views/whisper_view');
require('./ts/backbone/views/toast_view');
require('./ts/logging/set_up_renderer_logging').initialize();
