// Copyright 2016-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* global i18n: false */
/* global Whisper: false */
/* global $: false */

/* eslint-disable no-new */

// eslint-disable-next-line func-names
(function () {
  window.Whisper = window.Whisper || {};
  const { Settings } = window.Signal.Types;

  const {
    DEFAULT_DURATIONS_IN_SECONDS,
    DEFAULT_DURATIONS_SET,
    format: formatExpirationTimer,
  } = window.Signal.Util.expirationTimer;

  const CheckboxView = Whisper.View.extend({
    initialize(options) {
      this.name = options.name;
      this.setFn = options.setFn;
      this.value = options.value;
      this.populate();
    },
    events: {
      change: 'change',
    },
    change(e) {
      const value = e.target.checked;
      this.setFn(value);
      window.log.info(this.name, 'changed to', value);
    },
    populate() {
      this.$('input').prop('checked', !!this.value);
    },
  });

  const MediaPermissionsSettingView = Whisper.View.extend({
    initialize(options) {
      this.value = options.value;
      this.setFn = options.setFn;
      this.populate();
    },
    events: {
      change: 'change',
    },
    change(e) {
      this.value = e.target.checked;
      this.setFn(this.value);
      window.log.info('media-permissions changed to', this.value);
    },
    populate() {
      this.$('input').prop('checked', Boolean(this.value));
    },
  });

  const MediaCameraPermissionsSettingView = Whisper.View.extend({
    initialize(options) {
      this.value = options.value;
      this.setFn = options.setFn;
      this.populate();
    },
    events: {
      change: 'change',
    },
    change(e) {
      this.value = e.target.checked;
      this.setFn(this.value);
      window.log.info('media-camera-permissions changed to', this.value);
    },
    populate() {
      this.$('input').prop('checked', Boolean(this.value));
    },
  });

  const DisappearingMessagesView = Whisper.View.extend({
    template: () => $('#disappearingMessagesSettings').html(),
    initialize(options) {
      this.timeDialog = null;

      this.value = options.value || 0;

      this.render();
    },

    render_attributes() {
      const isCustomValue = this.isCustomValue();

      return {
        title: i18n('disappearingMessages'),
        timerValues: DEFAULT_DURATIONS_IN_SECONDS.map(seconds => {
          const text = formatExpirationTimer(i18n, seconds, {
            capitalizeOff: true,
          });
          return {
            selected: seconds === this.value ? 'selected' : undefined,
            value: seconds,
            text,
          };
        }),
        customSelected: isCustomValue ? 'selected' : undefined,
        customText: i18n(
          isCustomValue
            ? 'selectedCustomDisappearingTimeOption'
            : 'customDisappearingTimeOption'
        ),
        customInfo: isCustomValue
          ? {
              text: formatExpirationTimer(i18n, this.value),
            }
          : undefined,
        timerLabel: i18n('settings__DisappearingMessages__timer__label'),
        footer: i18n('settings__DisappearingMessages__footer'),
      };
    },

    events: {
      change: 'change',
    },

    change(e) {
      const value = parseInt(e.target.value, 10);

      if (value === -1) {
        this.showDialog();
        return;
      }

      this.updateValue(value);
      window.log.info('disappearing-messages-timer changed to', this.value);
    },

    isCustomValue() {
      return this.value && !DEFAULT_DURATIONS_SET.has(this.value);
    },

    showDialog() {
      this.closeDialog();

      this.timeDialog = new window.Whisper.ReactWrapperView({
        className: 'disappearing-time-dialog-wrapper',
        Component: window.Signal.Components.DisappearingTimeDialog,
        props: {
          i18n,
          initialValue: this.value,
          onSubmit: newValue => {
            this.updateValue(newValue);
            this.closeDialog();

            window.log.info(
              'disappearing-messages-timer changed to custom value',
              this.value
            );
          },
          onClose: () => {
            this.closeDialog();
          },
        },
      });
    },

    closeDialog() {
      if (this.timeDialog) {
        this.timeDialog.remove();
      }
      this.timeDialog = null;
    },

    updateValue(newValue) {
      this.value = newValue;
      window.setUniversalExpireTimer(newValue);
      this.render();
    },
  });

  const RadioButtonGroupView = Whisper.View.extend({
    initialize(options) {
      this.name = options.name;
      this.setFn = options.setFn;
      this.value = options.value;
      this.populate();
    },
    events: {
      change: 'change',
    },
    change(e) {
      const value = this.$(e.target).val();
      this.setFn(value);
      window.log.info(this.name, 'changed to', value);
    },
    populate() {
      this.$(`#${this.name}-${this.value}`).attr('checked', 'checked');
    },
  });
  Whisper.SettingsView = Whisper.View.extend({
    className: 'settings modal expand',
    template: () => $('#settings').html(),
    initialize() {
      this.render();
      new RadioButtonGroupView({
        el: this.$('.notification-settings'),
        name: 'notification-setting',
        value: window.initialData.notificationSetting,
        setFn: window.setNotificationSetting,
      });
      new RadioButtonGroupView({
        el: this.$('.theme-settings'),
        name: 'theme-setting',
        value: window.initialData.themeSetting,
        setFn: theme => {
          $(document.body)
            .removeClass('dark-theme')
            .removeClass('light-theme')
            .addClass(
              `${theme === 'system' ? window.systemTheme : theme}-theme`
            );
          window.setThemeSetting(theme);
        },
      });
      if (Settings.isDrawAttentionSupported()) {
        new CheckboxView({
          el: this.$('.draw-attention-setting'),
          name: 'draw-attention-setting',
          value: window.initialData.notificationDrawAttention,
          setFn: window.setNotificationDrawAttention,
        });
      }
      if (Settings.isAudioNotificationSupported()) {
        new CheckboxView({
          el: this.$('.audio-notification-setting'),
          name: 'audio-notification-setting',
          value: window.initialData.audioNotification,
          setFn: window.setAudioNotification,
        });
      }
      new CheckboxView({
        el: this.$('.badge-count-muted-conversations-setting'),
        name: 'badge-count-muted-conversations-setting',
        value: window.initialData.countMutedConversations,
        setFn: window.setCountMutedConversations,
      });
      new CheckboxView({
        el: this.$('.spell-check-setting'),
        name: 'spell-check-setting',
        value: window.initialData.spellCheck,
        setFn: val => {
          const $msg = this.$('.spell-check-setting-message');
          if (val !== window.appStartInitialSpellcheckSetting) {
            $msg.show();
            $msg.attr('aria-hidden', false);
          } else {
            $msg.hide();
            $msg.attr('aria-hidden', true);
          }
          window.setSpellCheck(val);
        },
      });
      if (Settings.isAutoLaunchSupported()) {
        new CheckboxView({
          el: this.$('.auto-launch-setting'),
          name: 'auto-launch-setting',
          value: window.initialData.autoLaunch,
          setFn: window.setAutoLaunch,
        });
      }
      if (Settings.isHideMenuBarSupported()) {
        new CheckboxView({
          el: this.$('.menu-bar-setting'),
          name: 'menu-bar-setting',
          value: window.initialData.hideMenuBar,
          setFn: window.setHideMenuBar,
        });
      }
      new CheckboxView({
        el: this.$('.always-relay-calls-setting'),
        name: 'always-relay-calls-setting',
        value: window.initialData.alwaysRelayCalls,
        setFn: window.setAlwaysRelayCalls,
      });
      new CheckboxView({
        el: this.$('.call-ringtone-notification-setting'),
        name: 'call-ringtone-notification-setting',
        value: window.initialData.callRingtoneNotification,
        setFn: window.setCallRingtoneNotification,
      });
      new CheckboxView({
        el: this.$('.call-system-notification-setting'),
        name: 'call-system-notification-setting',
        value: window.initialData.callSystemNotification,
        setFn: window.setCallSystemNotification,
      });
      new CheckboxView({
        el: this.$('.incoming-call-notification-setting'),
        name: 'incoming-call-notification-setting',
        value: window.initialData.incomingCallNotification,
        setFn: window.setIncomingCallNotification,
      });
      new MediaPermissionsSettingView({
        el: this.$('.media-permissions'),
        value: window.initialData.mediaPermissions,
        setFn: window.setMediaPermissions,
      });
      new MediaCameraPermissionsSettingView({
        el: this.$('.media-camera-permissions'),
        value: window.initialData.mediaCameraPermissions,
        setFn: window.setMediaCameraPermissions,
      });

      const disappearingMessagesView = new DisappearingMessagesView({
        value: window.initialData.universalExpireTimer,
        name: 'disappearing-messages-setting',
      });
      this.$('.disappearing-messages-setting').append(
        disappearingMessagesView.el
      );

      if (!window.initialData.isPrimary) {
        const syncView = new SyncView().render();
        this.$('.sync-setting').append(syncView.el);
      }
    },
    events: {
      'click .close': 'onClose',
      'click .clear-data': 'onClearData',
    },
    render_attributes() {
      const appStartSpellCheck = window.appStartInitialSpellcheckSetting;
      const spellCheckDirty =
        window.initialData.spellCheck !== appStartSpellCheck;

      return {
        deviceNameLabel: i18n('deviceName'),
        deviceName: window.initialData.deviceName,
        theme: i18n('theme'),
        notifications: i18n('notifications'),
        notificationSettingsDialog: i18n('notificationSettingsDialog'),
        settings: i18n('Keyboard--preferences'),
        disableNotifications: i18n('disableNotifications'),
        nameAndMessage: i18n('nameAndMessage'),
        noNameOrMessage: i18n('noNameOrMessage'),
        nameOnly: i18n('nameOnly'),
        notificationDrawAttention: i18n('notificationDrawAttention'),
        audioNotificationDescription: i18n('audioNotificationDescription'),
        isAudioNotificationSupported: Settings.isAudioNotificationSupported(),
        isHideMenuBarSupported: Settings.isHideMenuBarSupported(),
        isDrawAttentionSupported: Settings.isDrawAttentionSupported(),
        isAutoLaunchSupported: Settings.isAutoLaunchSupported(),
        hasSystemTheme: true,
        themeLight: i18n('themeLight'),
        themeDark: i18n('themeDark'),
        themeSystem: i18n('themeSystem'),
        hideMenuBar: i18n('hideMenuBar'),
        clearDataHeader: i18n('clearDataHeader'),
        clearDataButton: i18n('clearDataButton'),
        clearDataExplanation: i18n('clearDataExplanation'),
        calling: i18n('calling'),
        countMutedConversationsDescription: i18n(
          'countMutedConversationsDescription'
        ),
        alwaysRelayCallsDescription: i18n('alwaysRelayCallsDescription'),
        alwaysRelayCallsDetail: i18n('alwaysRelayCallsDetail'),
        callRingtoneNotificationDescription: i18n(
          'callRingtoneNotificationDescription'
        ),
        callSystemNotificationDescription: i18n(
          'callSystemNotificationDescription'
        ),
        incomingCallNotificationDescription: i18n(
          'incomingCallNotificationDescription'
        ),
        permissions: i18n('permissions'),
        mediaPermissionsDescription: i18n('mediaPermissionsDescription'),
        mediaCameraPermissionsDescription: i18n(
          'mediaCameraPermissionsDescription'
        ),
        generalHeader: i18n('general'),
        spellCheckDescription: i18n('spellCheckDescription'),
        spellCheckHidden: spellCheckDirty ? 'false' : 'true',
        spellCheckDisplay: spellCheckDirty ? 'inherit' : 'none',
        spellCheckDirtyText: appStartSpellCheck
          ? i18n('spellCheckWillBeDisabled')
          : i18n('spellCheckWillBeEnabled'),
        autoLaunchDescription: i18n('autoLaunchDescription'),
      };
    },
    onClose() {
      window.closeSettings();
    },
    onClearData() {
      window.deleteAllData();
      window.closeSettings();
    },
  });

  const SyncView = Whisper.View.extend({
    template: () => $('#syncSettings').html(),
    className: 'syncSettings',
    events: {
      'click .sync': 'sync',
    },
    initialize() {
      this.lastSyncTime = window.initialData.lastSyncTime;
    },
    enable() {
      this.$('.sync').text(i18n('syncNow'));
      this.$('.sync').removeAttr('disabled');
    },
    disable() {
      this.$('.sync').attr('disabled', 'disabled');
      this.$('.sync').text(i18n('syncing'));
    },
    onsuccess() {
      window.setLastSyncTime(Date.now());
      this.lastSyncTime = Date.now();
      window.log.info('sync successful');
      this.enable();
      this.render();
    },
    ontimeout() {
      window.log.error('sync timed out');
      this.$('.synced_at').hide();
      this.$('.sync_failed').show();
      this.enable();
    },
    async sync() {
      this.$('.sync_failed').hide();
      if (window.initialData.isPrimary) {
        window.log.warn('Tried to sync from device 1');
        return;
      }

      this.disable();
      try {
        await window.makeSyncRequest();
        this.onsuccess();
      } catch (error) {
        window.log.error(
          'settings sync timeout error:',
          error && error.stack ? error.stack : error
        );
        this.ontimeout();
      }
    },
    render_attributes() {
      const attrs = {
        sync: i18n('sync'),
        syncNow: i18n('syncNow'),
        syncExplanation: i18n('syncExplanation'),
        syncFailed: i18n('syncFailed'),
      };
      let date = this.lastSyncTime;
      if (date) {
        date = new Date(date);
        attrs.lastSynced = i18n('lastSynced');
        attrs.syncDate = date.toLocaleDateString();
        attrs.syncTime = date.toLocaleTimeString();
      }
      return attrs;
    },
  });
})();
