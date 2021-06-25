// Copyright 2015-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* global Signal:false */
/* global Backbone: false */

/* global drawAttention: false */
/* global i18n: false */
/* global storage: false */
/* global Whisper: false */
/* global _: false */

// eslint-disable-next-line func-names
(function () {
  window.Whisper = window.Whisper || {};

  // The keys and values don't match here. This is because the values correspond to old
  //   setting names. In the future, we may wish to migrate these to match.
  const SettingNames = {
    NO_NAME_OR_MESSAGE: 'count',
    NAME_ONLY: 'name',
    NAME_AND_MESSAGE: 'message',
  };

  // Electron, at least on Windows and macOS, only shows one notification at a time (see
  //   issues [#15364][0] and [#21646][1], among others). Because of that, we have a
  //   single slot for notifications, and once a notification is dismissed, all of
  //   Signal's notifications are dismissed.
  // [0]: https://github.com/electron/electron/issues/15364
  // [1]: https://github.com/electron/electron/issues/21646
  Whisper.Notifications = {
    ...Backbone.Events,

    isEnabled: false,

    // This is either a standard `Notification` or null.
    lastNotification: null,

    // This is either null or an object of this shape:
    //
    //     {
    //       conversationId: string;
    //       messageId: string;
    //       senderTitle: string;
    //       message: string;
    //       notificationIconUrl: string | void;
    //       isExpiringMessage: boolean;
    //       reaction: {
    //         emoji: string;
    //         fromId: string;
    //       };
    //     }
    notificationData: null,

    add(notificationData) {
      this.notificationData = notificationData;
      this.update();
    },

    // Remove the last notification if both conditions hold:
    //
    // 1. Either `conversationId` or `messageId` matches (if present)
    // 2. `emoji`, `targetAuthorUuid`, `targetTimestamp` matches (if present)
    removeBy({
      conversationId,
      messageId,
      emoji,
      targetAuthorUuid,
      targetTimestamp,
    }) {
      if (!this.notificationData) {
        return;
      }

      let shouldClear = false;
      if (
        conversationId &&
        this.notificationData.conversationId === conversationId
      ) {
        shouldClear = true;
      }
      if (messageId && this.notificationData.messageId === messageId) {
        shouldClear = true;
      }

      if (!shouldClear) {
        return;
      }

      const { reaction } = this.notificationData;
      if (
        reaction &&
        emoji &&
        targetAuthorUuid &&
        targetTimestamp &&
        (reaction.emoji !== emoji ||
          reaction.targetAuthorUuid !== targetAuthorUuid ||
          reaction.targetTimestamp !== targetTimestamp)
      ) {
        return;
      }

      this.clear();
      this.update();
    },

    fastUpdate() {
      if (this.lastNotification) {
        this.lastNotification.close();
        this.lastNotification = null;
      }

      const { isEnabled } = this;
      const isAppFocused = window.isActive();
      const isAudioNotificationEnabled =
        storage.get('audio-notification') || false;
      const userSetting = this.getUserSetting();

      const status = Signal.Notifications.getStatus({
        isAppFocused,
        isAudioNotificationEnabled,
        isEnabled,
        hasNotifications: Boolean(this.notificationData),
        userSetting,
      });

      if (status.type !== 'ok') {
        window.log.info(
          `Not updating notifications; notification status is ${status.type}. ${
            status.shouldClearNotifications ? 'Also clearing notifications' : ''
          }`
        );

        if (status.shouldClearNotifications) {
          this.notificationData = null;
        }

        return;
      }
      window.log.info('Showing a notification');

      let notificationTitle;
      let notificationMessage;
      let notificationIconUrl;

      const {
        conversationId,
        messageId,
        senderTitle,
        message,
        isExpiringMessage,
        reaction,
      } = this.notificationData;

      if (
        userSetting === SettingNames.NAME_ONLY ||
        userSetting === SettingNames.NAME_AND_MESSAGE
      ) {
        notificationTitle = senderTitle;
        ({ notificationIconUrl } = this.notificationData);

        const shouldHideExpiringMessageBody =
          isExpiringMessage && (Signal.OS.isMacOS() || Signal.OS.isWindows());
        if (shouldHideExpiringMessageBody) {
          notificationMessage = i18n('newMessage');
        } else if (userSetting === SettingNames.NAME_ONLY) {
          if (reaction) {
            notificationMessage = i18n('notificationReaction', {
              sender: senderTitle,
              emoji: reaction.emoji,
            });
          } else {
            notificationMessage = i18n('newMessage');
          }
        } else if (reaction) {
          notificationMessage = i18n('notificationReactionMessage', {
            sender: senderTitle,
            emoji: reaction.emoji,
            message,
          });
        } else {
          notificationMessage = message;
        }
      } else {
        if (userSetting !== SettingNames.NO_NAME_OR_MESSAGE) {
          window.log.error(
            `Error: Unknown user notification setting: '${userSetting}'`
          );
        }
        notificationTitle = 'Signal';
        notificationMessage = i18n('newMessage');
      }

      const shouldDrawAttention = storage.get(
        'notification-draw-attention',
        true
      );
      if (shouldDrawAttention) {
        drawAttention();
      }

      this.lastNotification = window.Signal.Services.notify({
        title: notificationTitle,
        icon: notificationIconUrl,
        message: notificationMessage,
        silent: !status.shouldPlayNotificationSound,
        onNotificationClick: () => {
          this.trigger('click', conversationId, messageId);
        },
      });
    },

    getUserSetting() {
      return (
        storage.get('notification-setting') || SettingNames.NAME_AND_MESSAGE
      );
    },
    clear() {
      window.log.info('Removing notification');
      this.notificationData = null;
      this.update();
    },
    // We don't usually call this, but when the process is shutting down, we should at
    //   least try to remove the notification immediately instead of waiting for the
    //   normal debounce.
    fastClear() {
      this.notificationData = null;
      this.fastUpdate();
    },
    enable() {
      const needUpdate = !this.isEnabled;
      this.isEnabled = true;
      if (needUpdate) {
        this.update();
      }
    },
    disable() {
      this.isEnabled = false;
    },
  };

  // Testing indicated that trying to create/destroy notifications too quickly
  //   resulted in notifications that stuck around forever, requiring the user
  //   to manually close them. This introduces a minimum amount of time between calls,
  //   and batches up the quick successive update() calls we get from an incoming
  //   read sync, which might have a number of messages referenced inside of it.
  Whisper.Notifications.update = _.debounce(
    Whisper.Notifications.fastUpdate.bind(Whisper.Notifications),
    1000
  );
})();
