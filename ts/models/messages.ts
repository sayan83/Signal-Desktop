// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { isEmpty } from 'lodash';
import {
  CustomError,
  GroupV1Update,
  MessageAttributesType,
  RetryOptions,
  ReactionAttributesType,
  ShallowChallengeError,
  QuotedMessageType,
  WhatIsThis,
} from '../model-types.d';
import { map, filter, find } from '../util/iterables';
import { isNotNil } from '../util/isNotNil';
import { DataMessageClass } from '../textsecure.d';
import { ConversationModel } from './conversations';
import { MessageStatusType } from '../components/conversation/Message';
import {
  OwnProps as SmartMessageDetailPropsType,
  Contact as SmartMessageDetailContact,
} from '../state/smart/MessageDetail';
import { getCallingNotificationText } from '../util/callingNotification';
import { CallbackResultType } from '../textsecure/SendMessage';
import * as expirationTimer from '../util/expirationTimer';

import { ReactionType } from '../types/Reactions';
import { AttachmentType, isImage, isVideo } from '../types/Attachment';
import { MIMEType, IMAGE_WEBP } from '../types/MIME';
import { ourProfileKeyService } from '../services/ourProfileKey';
import { markRead } from '../services/MessageUpdater';
import {
  isDirectConversation,
  isGroupV1,
  isGroupV2,
  isMe,
} from '../util/whatTypeOfConversation';
import { handleMessageSend } from '../util/handleMessageSend';
import { getSendOptions } from '../util/getSendOptions';
import { findAndFormatContact } from '../util/findAndFormatContact';
import {
  getLastChallengeError,
  getMessagePropStatus,
  getPropsForCallHistory,
  getPropsForMessage,
  hasErrors,
  isCallHistory,
  isChatSessionRefreshed,
  isDeliveryIssue,
  isEndSession,
  isExpirationTimerUpdate,
  isGroupUpdate,
  isGroupV1Migration,
  isGroupV2Change,
  isIncoming,
  isKeyChange,
  isMessageHistoryUnsynced,
  isOutgoing,
  isProfileChange,
  isTapToView,
  isUniversalTimerNotification,
  isUnsupportedMessage,
  isVerifiedChange,
  processBodyRanges,
} from '../state/selectors/message';
import {
  isInCall,
  getCallSelector,
  getActiveCall,
} from '../state/selectors/calling';
import { getAccountSelector } from '../state/selectors/accounts';
import { DeliveryReceipts } from '../messageModifiers/DeliveryReceipts';
import { Deletes } from '../messageModifiers/Deletes';
import { Reactions } from '../messageModifiers/Reactions';
import { ReadReceipts } from '../messageModifiers/ReadReceipts';
import { ReadSyncs } from '../messageModifiers/ReadSyncs';
import { ViewSyncs } from '../messageModifiers/ViewSyncs';
import * as AttachmentDownloads from '../messageModifiers/AttachmentDownloads';

/* eslint-disable camelcase */
/* eslint-disable more/no-then */

type PropsForMessageDetail = Pick<
  SmartMessageDetailPropsType,
  'sentAt' | 'receivedAt' | 'message' | 'errors' | 'contacts'
>;

declare const _: typeof window._;

window.Whisper = window.Whisper || {};

const {
  Message: TypedMessage,
  Attachment,
  MIME,
  Contact,
  Errors,
} = window.Signal.Types;
const {
  deleteExternalMessageFiles,
  loadAttachmentData,
  loadQuoteData,
  loadPreviewData,
  loadStickerData,
  upgradeMessageSchema,
} = window.Signal.Migrations;
const {
  copyStickerToAttachments,
  deletePackReference,
  savePackMetadata,
  getStickerPackStatus,
} = window.Signal.Stickers;
const { getTextWithMentions, GoogleChrome } = window.Signal.Util;

const { addStickerPackReference, getMessageBySender } = window.Signal.Data;
const { bytesFromString } = window.Signal.Crypto;

const includesAny = <T>(haystack: Array<T>, ...needles: Array<T>) =>
  needles.some(needle => haystack.includes(needle));

export function isQuoteAMatch(
  message: MessageModel | null | undefined,
  conversationId: string,
  quote: QuotedMessageType | DataMessageClass.Quote
): message is MessageModel {
  if (!message) {
    return false;
  }

  const { authorUuid, id } = quote;
  const authorConversationId = window.ConversationController.ensureContactIds({
    e164: 'author' in quote ? quote.author : undefined,
    uuid: authorUuid,
  });

  return (
    message.get('sent_at') === id &&
    message.get('conversationId') === conversationId &&
    message.getContactId() === authorConversationId
  );
}

export class MessageModel extends window.Backbone.Model<MessageAttributesType> {
  static updateTimers: () => void;

  static getLongMessageAttachment: (
    attachment: typeof window.WhatIsThis
  ) => typeof window.WhatIsThis;

  CURRENT_PROTOCOL_VERSION?: number;

  // Set when sending some sync messages, so we get the functionality of
  //   send(), without zombie messages going into the database.
  doNotSave?: boolean;

  INITIAL_PROTOCOL_VERSION?: number;

  OUR_NUMBER?: string;

  OUR_UUID?: string;

  isSelected?: boolean;

  syncPromise?: Promise<unknown>;

  initialize(attributes: unknown): void {
    if (_.isObject(attributes)) {
      this.set(
        TypedMessage.initializeSchemaVersion({
          message: attributes,
          logger: window.log,
        })
      );
    }

    this.CURRENT_PROTOCOL_VERSION =
      window.textsecure.protobuf.DataMessage.ProtocolVersion.CURRENT;
    this.INITIAL_PROTOCOL_VERSION =
      window.textsecure.protobuf.DataMessage.ProtocolVersion.INITIAL;
    this.OUR_NUMBER = window.textsecure.storage.user.getNumber();
    this.OUR_UUID = window.textsecure.storage.user.getUuid();

    this.on('change', this.notifyRedux);
  }

  notifyRedux(): void {
    const { messageChanged } = window.reduxActions.conversations;

    if (messageChanged) {
      const conversationId = this.get('conversationId');
      // Note: The clone is important for triggering a re-run of selectors
      messageChanged(this.id, conversationId, { ...this.attributes });
    }
  }

  getSenderIdentifier(): string {
    const sentAt = this.get('sent_at');
    const source = this.get('source');
    const sourceUuid = this.get('sourceUuid');
    const sourceDevice = this.get('sourceDevice');

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sourceId = window.ConversationController.ensureContactIds({
      e164: source,
      uuid: sourceUuid,
    })!;

    return `${sourceId}.${sourceDevice}-${sentAt}`;
  }

  getReceivedAt(): number {
    // We would like to get the received_at_ms ideally since received_at is
    // now an incrementing counter for messages and not the actual time that
    // the message was received. If this field doesn't exist on the message
    // then we can trust received_at.
    return Number(this.get('received_at_ms') || this.get('received_at'));
  }

  isNormalBubble(): boolean {
    const { attributes } = this;

    return (
      !isCallHistory(attributes) &&
      !isChatSessionRefreshed(attributes) &&
      !isEndSession(attributes) &&
      !isExpirationTimerUpdate(attributes) &&
      !isGroupUpdate(attributes) &&
      !isGroupV2Change(attributes) &&
      !isGroupV1Migration(attributes) &&
      !isKeyChange(attributes) &&
      !isMessageHistoryUnsynced(attributes) &&
      !isProfileChange(attributes) &&
      !isUniversalTimerNotification(attributes) &&
      !isUnsupportedMessage(attributes) &&
      !isVerifiedChange(attributes)
    );
  }

  getPropsForMessageDetail(): PropsForMessageDetail {
    const newIdentity = window.i18n('newIdentity');
    const OUTGOING_KEY_ERROR = 'OutgoingIdentityKeyError';

    const unidentifiedLookup = (
      this.get('unidentifiedDeliveries') || []
    ).reduce((accumulator: Record<string, boolean>, identifier: string) => {
      accumulator[
        window.ConversationController.getConversationId(identifier) as string
      ] = true;
      return accumulator;
    }, Object.create(null) as Record<string, boolean>);

    // We include numbers we didn't successfully send to so we can display errors.
    // Older messages don't have the recipients included on the message, so we fall
    //   back to the conversation's current recipients
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const conversationIds = isIncoming(this.attributes)
      ? [this.getContactId()!]
      : _.union(
          (this.get('sent_to') || []).map(
            (id: string) => window.ConversationController.getConversationId(id)!
          ),
          (
            this.get('recipients') || this.getConversation()!.getRecipients()
          ).map(
            (id: string) => window.ConversationController.getConversationId(id)!
          )
        );
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    // This will make the error message for outgoing key errors a bit nicer
    const allErrors = (this.get('errors') || []).map(error => {
      if (error.name === OUTGOING_KEY_ERROR) {
        // eslint-disable-next-line no-param-reassign
        error.message = newIdentity;
      }

      return error;
    });

    // If an error has a specific number it's associated with, we'll show it next to
    //   that contact. Otherwise, it will be a standalone entry.
    const errors = _.reject(allErrors, error =>
      Boolean(error.identifier || error.number)
    );
    const errorsGroupedById = _.groupBy(allErrors, error => {
      const identifier = error.identifier || error.number;
      if (!identifier) {
        return null;
      }

      return window.ConversationController.getConversationId(identifier);
    });
    const finalContacts: Array<SmartMessageDetailContact> = (
      conversationIds || []
    ).map(
      (id: string): SmartMessageDetailContact => {
        const errorsForContact = errorsGroupedById[id];
        const isOutgoingKeyError = Boolean(
          _.find(errorsForContact, error => error.name === OUTGOING_KEY_ERROR)
        );
        const isUnidentifiedDelivery =
          window.storage.get('unidentifiedDeliveryIndicators', false) &&
          this.isUnidentifiedDelivery(id, unidentifiedLookup);

        return {
          ...findAndFormatContact(id),

          status: this.getStatus(id),
          errors: errorsForContact,
          isOutgoingKeyError,
          isUnidentifiedDelivery,
        };
      }
    );
    // The prefix created here ensures that contacts with errors are listed
    //   first; otherwise it's alphabetical
    const collator = new Intl.Collator();
    const sortedContacts: Array<SmartMessageDetailContact> = finalContacts.sort(
      (
        left: SmartMessageDetailContact,
        right: SmartMessageDetailContact
      ): number => {
        const leftErrors = Boolean(left.errors && left.errors.length);
        const rightErrors = Boolean(right.errors && right.errors.length);

        if (leftErrors && !rightErrors) {
          return -1;
        }
        if (!leftErrors && rightErrors) {
          return 1;
        }

        return collator.compare(left.title, right.title);
      }
    );

    return {
      sentAt: this.get('sent_at'),
      receivedAt: this.getReceivedAt(),
      message: getPropsForMessage(
        this.attributes,
        findAndFormatContact,
        window.ConversationController.getOurConversationIdOrThrow(),
        this.OUR_NUMBER,
        this.OUR_UUID,
        undefined,
        undefined,
        window.storage.get('read-receipt-setting', false),
        window.storage.get('regionCode', 'ZZ'),
        (identifier?: string) => {
          const state = window.reduxStore.getState();
          const accountSelector = getAccountSelector(state);
          return accountSelector(identifier);
        }
      ),
      errors,
      contacts: sortedContacts,
    };
  }

  // Dependencies of prop-generation functions
  getConversation(): ConversationModel | undefined {
    return window.ConversationController.get(this.get('conversationId'));
  }

  private getStatus(identifier: string): MessageStatusType | null {
    const conversation = window.ConversationController.get(identifier);

    if (!conversation) {
      return null;
    }

    const e164 = conversation.get('e164');
    const uuid = conversation.get('uuid');
    const conversationId = conversation.get('id');

    const readBy = this.get('read_by') || [];
    if (includesAny(readBy, conversationId, e164, uuid)) {
      return 'read';
    }
    const deliveredTo = this.get('delivered_to') || [];
    if (includesAny(deliveredTo, conversationId, e164, uuid)) {
      return 'delivered';
    }
    const sentTo = this.get('sent_to') || [];
    if (includesAny(sentTo, conversationId, e164, uuid)) {
      return 'sent';
    }

    return null;
  }

  getNotificationData(): { emoji?: string; text: string } {
    const { attributes } = this;

    if (isDeliveryIssue(attributes)) {
      return {
        emoji: '⚠️',
        text: window.i18n('DeliveryIssue--preview'),
      };
    }

    if (isChatSessionRefreshed(attributes)) {
      return {
        emoji: '🔁',
        text: window.i18n('ChatRefresh--notification'),
      };
    }

    if (isUnsupportedMessage(attributes)) {
      return {
        text: window.i18n('message--getDescription--unsupported-message'),
      };
    }

    if (isGroupV1Migration(attributes)) {
      return {
        text: window.i18n('GroupV1--Migration--was-upgraded'),
      };
    }

    if (isProfileChange(attributes)) {
      const change = this.get('profileChange');
      const changedId = this.get('changedId');
      const changedContact = findAndFormatContact(changedId);
      if (!change) {
        throw new Error('getNotificationData: profileChange was missing!');
      }

      return {
        text: window.Signal.Util.getStringForProfileChange(
          change,
          changedContact,
          window.i18n
        ),
      };
    }

    if (isGroupV2Change(attributes)) {
      const { protobuf } = window.textsecure;
      const change = this.get('groupV2Change');

      const lines = window.Signal.GroupChange.renderChange(change, {
        AccessControlEnum: protobuf.AccessControl.AccessRequired,
        i18n: window.i18n,
        ourConversationId: window.ConversationController.getOurConversationId(),
        renderContact: (conversationId: string) => {
          const conversation = window.ConversationController.get(
            conversationId
          );
          return conversation
            ? conversation.getTitle()
            : window.i18n('unknownUser');
        },
        renderString: (
          key: string,
          _i18n: unknown,
          placeholders: Array<string>
        ) => window.i18n(key, placeholders),
        RoleEnum: protobuf.Member.Role,
      });

      return { text: lines.join(' ') };
    }

    const attachments = this.get('attachments') || [];

    if (isTapToView(attributes)) {
      if (this.isErased()) {
        return {
          text: window.i18n('message--getDescription--disappearing-media'),
        };
      }

      if (Attachment.isImage(attachments)) {
        return {
          text: window.i18n('message--getDescription--disappearing-photo'),
          emoji: '📷',
        };
      }
      if (Attachment.isVideo(attachments)) {
        return {
          text: window.i18n('message--getDescription--disappearing-video'),
          emoji: '🎥',
        };
      }
      // There should be an image or video attachment, but we have a fallback just in
      //   case.
      return { text: window.i18n('mediaMessage'), emoji: '📎' };
    }

    if (isGroupUpdate(attributes)) {
      const groupUpdate = this.get('group_update');
      const fromContact = this.getContact();
      const messages = [];
      if (!groupUpdate) {
        throw new Error('getNotificationData: Missing group_update');
      }

      if (groupUpdate.left === 'You') {
        return { text: window.i18n('youLeftTheGroup') };
      }
      if (groupUpdate.left) {
        return {
          text: window.i18n('leftTheGroup', [
            this.getNameForNumber(groupUpdate.left),
          ]),
        };
      }

      if (!fromContact) {
        return { text: '' };
      }

      if (isMe(fromContact.attributes)) {
        messages.push(window.i18n('youUpdatedTheGroup'));
      } else {
        messages.push(window.i18n('updatedTheGroup', [fromContact.getTitle()]));
      }

      if (groupUpdate.joined && groupUpdate.joined.length) {
        const joinedContacts = _.map(groupUpdate.joined, item =>
          window.ConversationController.getOrCreate(item, 'private')
        );
        const joinedWithoutMe = joinedContacts.filter(
          contact => !isMe(contact.attributes)
        );

        if (joinedContacts.length > 1) {
          messages.push(
            window.i18n('multipleJoinedTheGroup', [
              _.map(joinedWithoutMe, contact => contact.getTitle()).join(', '),
            ])
          );

          if (joinedWithoutMe.length < joinedContacts.length) {
            messages.push(window.i18n('youJoinedTheGroup'));
          }
        } else {
          const joinedContact = window.ConversationController.getOrCreate(
            groupUpdate.joined[0],
            'private'
          );
          if (isMe(joinedContact.attributes)) {
            messages.push(window.i18n('youJoinedTheGroup'));
          } else {
            messages.push(
              window.i18n('joinedTheGroup', [joinedContacts[0].getTitle()])
            );
          }
        }
      }

      if (groupUpdate.name) {
        messages.push(window.i18n('titleIsNow', [groupUpdate.name]));
      }
      if (groupUpdate.avatarUpdated) {
        messages.push(window.i18n('updatedGroupAvatar'));
      }

      return { text: messages.join(' ') };
    }
    if (isEndSession(attributes)) {
      return { text: window.i18n('sessionEnded') };
    }
    if (isIncoming(attributes) && hasErrors(attributes)) {
      return { text: window.i18n('incomingError') };
    }

    const body = (this.get('body') || '').trim();

    if (attachments.length) {
      // This should never happen but we want to be extra-careful.
      const attachment = attachments[0] || {};
      const { contentType } = attachment;

      if (contentType === MIME.IMAGE_GIF || Attachment.isGIF(attachments)) {
        return {
          text: body || window.i18n('message--getNotificationText--gif'),
          emoji: '🎡',
        };
      }
      if (Attachment.isImage(attachments)) {
        return {
          text: body || window.i18n('message--getNotificationText--photo'),
          emoji: '📷',
        };
      }
      if (Attachment.isVideo(attachments)) {
        return {
          text: body || window.i18n('message--getNotificationText--video'),
          emoji: '🎥',
        };
      }
      if (Attachment.isVoiceMessage(attachment)) {
        return {
          text:
            body || window.i18n('message--getNotificationText--voice-message'),
          emoji: '🎤',
        };
      }
      if (Attachment.isAudio(attachments)) {
        return {
          text:
            body || window.i18n('message--getNotificationText--audio-message'),
          emoji: '🔈',
        };
      }
      return {
        text: body || window.i18n('message--getNotificationText--file'),
        emoji: '📎',
      };
    }

    const stickerData = this.get('sticker');
    if (stickerData) {
      const sticker = window.Signal.Stickers.getSticker(
        stickerData.packId,
        stickerData.stickerId
      );
      const { emoji } = sticker || {};
      if (!emoji) {
        window.log.warn('Unable to get emoji for sticker');
      }
      return {
        text: window.i18n('message--getNotificationText--stickers'),
        emoji,
      };
    }

    if (isCallHistory(attributes)) {
      const state = window.reduxStore.getState();
      const callingNotification = getPropsForCallHistory(
        attributes,
        findAndFormatContact,
        getCallSelector(state),
        getActiveCall(state)
      );
      if (callingNotification) {
        return {
          text: getCallingNotificationText(callingNotification, window.i18n),
        };
      }

      window.log.error(
        "This call history message doesn't have valid call history"
      );
    }
    if (isExpirationTimerUpdate(attributes)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { expireTimer } = this.get('expirationTimerUpdate')!;
      if (!expireTimer) {
        return { text: window.i18n('disappearingMessagesDisabled') };
      }

      return {
        text: window.i18n('timerSetTo', [
          expirationTimer.format(window.i18n, expireTimer),
        ]),
      };
    }

    if (isKeyChange(attributes)) {
      const identifier = this.get('key_changed');
      const conversation = window.ConversationController.get(identifier);
      return {
        text: window.i18n('safetyNumberChangedGroup', [
          conversation ? conversation.getTitle() : null,
        ]),
      };
    }
    const contacts = this.get('contact');
    if (contacts && contacts.length) {
      return {
        text: Contact.getName(contacts[0]) || window.i18n('unknownContact'),
        emoji: '👤',
      };
    }

    if (body) {
      return { text: body };
    }

    return { text: '' };
  }

  getRawText(): string {
    const body = (this.get('body') || '').trim();
    const { attributes } = this;

    const bodyRanges = processBodyRanges(
      attributes.bodyRanges,
      findAndFormatContact
    );
    if (bodyRanges) {
      return getTextWithMentions(bodyRanges, body);
    }

    return body;
  }

  getNotificationText(): string {
    const { text, emoji } = this.getNotificationData();
    const { attributes } = this;

    let modifiedText = text;

    const bodyRanges = processBodyRanges(
      attributes.bodyRanges,
      findAndFormatContact
    );

    if (bodyRanges && bodyRanges.length) {
      modifiedText = getTextWithMentions(bodyRanges, modifiedText);
    }

    // Linux emoji support is mixed, so we disable it. (Note that this doesn't touch
    //   the `text`, which can contain emoji.)
    const shouldIncludeEmoji = Boolean(emoji) && !window.Signal.OS.isLinux();
    if (shouldIncludeEmoji) {
      return window.i18n('message--getNotificationText--text-with-emoji', {
        text: modifiedText,
        emoji,
      });
    }
    return modifiedText;
  }

  // General
  idForLogging(): string {
    const account = this.getSourceUuid() || this.getSource();
    const device = this.getSourceDevice();
    const timestamp = this.get('sent_at');

    return `${account}.${device} ${timestamp}`;
  }

  // eslint-disable-next-line class-methods-use-this
  defaults(): Partial<MessageAttributesType> {
    return {
      timestamp: new Date().getTime(),
      attachments: [],
    };
  }

  // eslint-disable-next-line class-methods-use-this
  validate(attributes: Record<string, unknown>): void {
    const required = ['conversationId', 'received_at', 'sent_at'];
    const missing = _.filter(required, attr => !attributes[attr]);
    if (missing.length) {
      window.log.warn(`Message missing attributes: ${missing}`);
    }
  }

  isUnread(): boolean {
    return !!this.get('unread');
  }

  merge(model: MessageModel): void {
    const attributes = model.attributes || model;
    this.set(attributes);
  }

  // eslint-disable-next-line class-methods-use-this
  getNameForNumber(number: string): string {
    const conversation = window.ConversationController.get(number);
    if (!conversation) {
      return number;
    }
    return conversation.getTitle();
  }

  async cleanup(): Promise<void> {
    const { messageDeleted } = window.reduxActions.conversations;
    messageDeleted(this.id, this.get('conversationId'));

    this.getConversation()?.debouncedUpdateLastMessage?.();

    window.MessageController.unregister(this.id);
    await this.deleteData();
  }

  async deleteData(): Promise<void> {
    await deleteExternalMessageFiles(this.attributes);

    const sticker = this.get('sticker');
    if (!sticker) {
      return;
    }

    const { packId } = sticker;
    if (packId) {
      await deletePackReference(this.id, packId);
    }
  }

  isValidTapToView(): boolean {
    const body = this.get('body');
    if (body) {
      return false;
    }

    const attachments = this.get('attachments');
    if (!attachments || attachments.length !== 1) {
      return false;
    }

    const firstAttachment = attachments[0];
    if (
      !window.Signal.Util.GoogleChrome.isImageTypeSupported(
        firstAttachment.contentType
      ) &&
      !window.Signal.Util.GoogleChrome.isVideoTypeSupported(
        firstAttachment.contentType
      )
    ) {
      return false;
    }

    const quote = this.get('quote');
    const sticker = this.get('sticker');
    const contact = this.get('contact');
    const preview = this.get('preview');

    if (
      quote ||
      sticker ||
      (contact && contact.length > 0) ||
      (preview && preview.length > 0)
    ) {
      return false;
    }

    return true;
  }

  async markViewed(options?: { fromSync?: boolean }): Promise<void> {
    const { fromSync } = options || {};

    if (!this.isValidTapToView()) {
      window.log.warn(
        `markViewed: Message ${this.idForLogging()} is not a valid tap to view message!`
      );
      return;
    }
    if (this.isErased()) {
      window.log.warn(
        `markViewed: Message ${this.idForLogging()} is already erased!`
      );
      return;
    }

    if (this.get('unread')) {
      this.set(markRead(this.attributes));
    }

    await this.eraseContents();

    if (!fromSync) {
      const sender = this.getSource();
      const senderUuid = this.getSourceUuid();

      if (senderUuid === undefined) {
        throw new Error('senderUuid is undefined');
      }

      const timestamp = this.get('sent_at');
      const ourNumber = window.textsecure.storage.user.getNumber();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const ourUuid = window.textsecure.storage.user.getUuid()!;
      const {
        wrap,
        sendOptions,
      } = await window.ConversationController.prepareForSend(
        ourNumber || ourUuid,
        {
          syncMessage: true,
        }
      );

      await wrap(
        window.textsecure.messaging.syncViewOnceOpen(
          sender,
          senderUuid,
          timestamp,
          sendOptions
        )
      );
    }
  }

  async doubleCheckMissingQuoteReference(): Promise<void> {
    const logId = this.idForLogging();
    const quote = this.get('quote');
    if (!quote) {
      window.log.warn(
        `doubleCheckMissingQuoteReference/${logId}: Missing quote!`
      );
      return;
    }

    const { authorUuid, author, id: sentAt, referencedMessageNotFound } = quote;
    const contact = window.ConversationController.get(authorUuid || author);

    // Is the quote really without a reference? Check with our in memory store
    // first to make sure it's not there.
    if (referencedMessageNotFound && contact) {
      window.log.info(
        `doubleCheckMissingQuoteReference/${logId}: Verifying reference to ${sentAt}`
      );
      const inMemoryMessages = window.MessageController.filterBySentAt(
        Number(sentAt)
      );
      const matchingMessage = find(inMemoryMessages, message =>
        isQuoteAMatch(message, this.get('conversationId'), quote)
      );
      if (!matchingMessage) {
        window.log.info(
          `doubleCheckMissingQuoteReference/${logId}: No match for ${sentAt}.`
        );

        return;
      }

      this.set({
        quote: {
          ...quote,
          referencedMessageNotFound: false,
        },
      });

      window.log.info(
        `doubleCheckMissingQuoteReference/${logId}: Found match for ${sentAt}, updating.`
      );

      await this.copyQuoteContentFromOriginal(matchingMessage, quote);
      this.set({
        quote: {
          ...quote,
          referencedMessageNotFound: false,
        },
      });
      window.Signal.Util.queueUpdateMessage(this.attributes);
    }
  }

  isErased(): boolean {
    return Boolean(this.get('isErased'));
  }

  async eraseContents(
    additionalProperties = {},
    shouldPersist = true
  ): Promise<void> {
    window.log.info(`Erasing data for message ${this.idForLogging()}`);

    // Note: There are cases where we want to re-erase a given message. For example, when
    //   a viewed (or outgoing) View-Once message is deleted for everyone.

    try {
      await this.deleteData();
    } catch (error) {
      window.log.error(
        `Error erasing data for message ${this.idForLogging()}:`,
        error && error.stack ? error.stack : error
      );
    }

    this.set({
      isErased: true,
      body: '',
      bodyRanges: undefined,
      attachments: [],
      quote: undefined,
      contact: [],
      sticker: undefined,
      preview: [],
      ...additionalProperties,
    });
    this.getConversation()?.debouncedUpdateLastMessage?.();

    if (shouldPersist) {
      await window.Signal.Data.saveMessage(this.attributes, {
        Message: window.Whisper.Message,
      });
    }
  }

  isEmpty(): boolean {
    const { attributes } = this;

    // Core message types - we check for all four because they can each stand alone
    const hasBody = Boolean(this.get('body'));
    const hasAttachment = (this.get('attachments') || []).length > 0;
    const hasEmbeddedContact = (this.get('contact') || []).length > 0;
    const isSticker = Boolean(this.get('sticker'));

    // Rendered sync messages
    const isCallHistoryValue = isCallHistory(attributes);
    const isChatSessionRefreshedValue = isChatSessionRefreshed(attributes);
    const isDeliveryIssueValue = isDeliveryIssue(attributes);
    const isGroupUpdateValue = isGroupUpdate(attributes);
    const isGroupV2ChangeValue = isGroupV2Change(attributes);
    const isEndSessionValue = isEndSession(attributes);
    const isExpirationTimerUpdateValue = isExpirationTimerUpdate(attributes);
    const isVerifiedChangeValue = isVerifiedChange(attributes);

    // Placeholder messages
    const isUnsupportedMessageValue = isUnsupportedMessage(attributes);
    const isTapToViewValue = isTapToView(attributes);

    // Errors
    const hasErrorsValue = hasErrors(attributes);

    // Locally-generated notifications
    const isKeyChangeValue = isKeyChange(attributes);
    const isMessageHistoryUnsyncedValue = isMessageHistoryUnsynced(attributes);
    const isProfileChangeValue = isProfileChange(attributes);
    const isUniversalTimerNotificationValue = isUniversalTimerNotification(
      attributes
    );

    // Note: not all of these message types go through message.handleDataMessage

    const hasSomethingToDisplay =
      // Core message types
      hasBody ||
      hasAttachment ||
      hasEmbeddedContact ||
      isSticker ||
      // Rendered sync messages
      isCallHistoryValue ||
      isChatSessionRefreshedValue ||
      isDeliveryIssueValue ||
      isGroupUpdateValue ||
      isGroupV2ChangeValue ||
      isEndSessionValue ||
      isExpirationTimerUpdateValue ||
      isVerifiedChangeValue ||
      // Placeholder messages
      isUnsupportedMessageValue ||
      isTapToViewValue ||
      // Errors
      hasErrorsValue ||
      // Locally-generated notifications
      isKeyChangeValue ||
      isMessageHistoryUnsyncedValue ||
      isProfileChangeValue ||
      isUniversalTimerNotificationValue;

    return !hasSomethingToDisplay;
  }

  isUnidentifiedDelivery(
    contactId: string,
    lookup: Record<string, unknown>
  ): boolean {
    if (isIncoming(this.attributes)) {
      return Boolean(this.get('unidentifiedDeliveryReceived'));
    }

    return Boolean(lookup[contactId]);
  }

  getSource(): string | undefined {
    if (isIncoming(this.attributes)) {
      return this.get('source');
    }

    return this.OUR_NUMBER;
  }

  getSourceDevice(): string | number | undefined {
    const sourceDevice = this.get('sourceDevice');

    if (isIncoming(this.attributes)) {
      return sourceDevice;
    }

    return sourceDevice || window.textsecure.storage.user.getDeviceId();
  }

  getSourceUuid(): string | undefined {
    if (isIncoming(this.attributes)) {
      return this.get('sourceUuid');
    }

    return this.OUR_UUID;
  }

  getContactId(): string | undefined {
    const source = this.getSource();
    const sourceUuid = this.getSourceUuid();

    if (!source && !sourceUuid) {
      return window.ConversationController.getOurConversationId();
    }

    return window.ConversationController.ensureContactIds({
      e164: source,
      uuid: sourceUuid,
    });
  }

  getContact(): ConversationModel | undefined {
    const id = this.getContactId();
    return window.ConversationController.get(id);
  }

  async saveErrors(
    providedErrors: Error | Array<Error>,
    options: { skipSave?: boolean } = {}
  ): Promise<void> {
    const { skipSave } = options;

    let errors: Array<CustomError>;

    if (!(providedErrors instanceof Array)) {
      errors = [providedErrors];
    } else {
      errors = providedErrors;
    }

    errors.forEach(e => {
      window.log.error(
        'Message.saveErrors:',
        e && e.reason ? e.reason : null,
        e && e.stack ? e.stack : e
      );
    });
    errors = errors.map(e => {
      // Note: in our environment, instanceof can be scary, so we have a backup check
      //   (Node.js vs Browser context).
      // We check instanceof second because typescript believes that anything that comes
      //   through here must be an instance of Error, so e is 'never' after that check.
      if ((e.message && e.stack) || e instanceof Error) {
        return _.pick(
          e,
          'name',
          'message',
          'code',
          'number',
          'identifier',
          'retryAfter',
          'data',
          'reason'
        ) as Required<Error>;
      }
      return e;
    });
    errors = errors.concat(this.get('errors') || []);

    this.set({ errors });

    if (
      !this.doNotSave &&
      errors.some(error => error.name === 'SendMessageChallengeError')
    ) {
      await window.Signal.challengeHandler.register(this);
    }

    if (!skipSave && !this.doNotSave) {
      await window.Signal.Data.saveMessage(this.attributes, {
        Message: window.Whisper.Message,
      });
    }
  }

  markRead(readAt?: number, options = {}): void {
    this.set(markRead(this.attributes, readAt, options));
  }

  getIncomingContact(): ConversationModel | undefined | null {
    if (!isIncoming(this.attributes)) {
      return null;
    }
    const source = this.get('source');
    if (!source) {
      return null;
    }

    return window.ConversationController.getOrCreate(source, 'private');
  }

  // Send infrastructure
  // One caller today: event handler for the 'Retry Send' entry in triple-dot menu
  async retrySend(): Promise<string | null | void | Array<void>> {
    if (!window.textsecure.messaging) {
      window.log.error('retrySend: Cannot retry since we are offline!');
      return null;
    }

    const retryOptions = this.get('retryOptions');

    this.set({ errors: undefined, retryOptions: undefined });

    if (retryOptions) {
      return this.sendUtilityMessageWithRetry(retryOptions);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const conversation = this.getConversation()!;
    const exists = (v: string | null): v is string => Boolean(v);
    const intendedRecipients = (this.get('recipients') || [])
      .map(identifier =>
        window.ConversationController.getConversationId(identifier)
      )
      .filter(exists);
    const successfulRecipients = (this.get('sent_to') || [])
      .map(identifier =>
        window.ConversationController.getConversationId(identifier)
      )
      .filter(exists);
    const currentRecipients = conversation
      .getRecipients()
      .map(identifier =>
        window.ConversationController.getConversationId(identifier)
      )
      .filter(exists);

    const profileKey = conversation.get('profileSharing')
      ? await ourProfileKeyService.get()
      : undefined;

    // Determine retry recipients and get their most up-to-date addressing information
    let recipients = _.intersection(intendedRecipients, currentRecipients);
    recipients = _.without(recipients, ...successfulRecipients)
      .map(id => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const c = window.ConversationController.get(id)!;
        return c.getSendTarget();
      })
      .filter((recipient): recipient is string => recipient !== undefined);

    if (!recipients.length) {
      window.log.warn('retrySend: Nobody to send to!');

      return window.Signal.Data.saveMessage(this.attributes, {
        Message: window.Whisper.Message,
      });
    }

    const attachmentsWithData = await Promise.all(
      (this.get('attachments') || []).map(loadAttachmentData)
    );
    const {
      body,
      attachments,
    } = window.Whisper.Message.getLongMessageAttachment({
      body: this.get('body'),
      attachments: attachmentsWithData,
      now: this.get('sent_at'),
    });

    const quoteWithData = await loadQuoteData(this.get('quote'));
    const previewWithData = await loadPreviewData(this.get('preview'));
    const stickerWithData = await loadStickerData(this.get('sticker'));

    // Special-case the self-send case - we send only a sync message
    if (
      recipients.length === 1 &&
      (recipients[0] === this.OUR_NUMBER || recipients[0] === this.OUR_UUID)
    ) {
      const dataMessage = await window.textsecure.messaging.getDataMessage({
        attachments,
        body,
        deletedForEveryoneTimestamp: this.get('deletedForEveryoneTimestamp'),
        expireTimer: this.get('expireTimer'),
        // flags
        mentions: this.get('bodyRanges'),
        preview: previewWithData,
        profileKey,
        quote: quoteWithData,
        reaction: null,
        recipients,
        sticker: stickerWithData,
        timestamp: this.get('sent_at'),
      });
      return this.sendSyncMessageOnly(dataMessage);
    }

    let promise;
    const options = await getSendOptions(conversation.attributes);

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    if (isDirectConversation(conversation.attributes)) {
      const [identifier] = recipients;
      promise = window.textsecure.messaging.sendMessageToIdentifier(
        identifier,
        body,
        attachments,
        quoteWithData,
        previewWithData,
        stickerWithData,
        null,
        this.get('deletedForEveryoneTimestamp'),
        this.get('sent_at'),
        this.get('expireTimer'),
        ContentHint.RESENDABLE,
        undefined, // groupId
        profileKey,
        options
      );
    } else {
      const initialGroupV2 = conversation.getGroupV2Info();
      const groupId = conversation.get('groupId');
      if (!groupId) {
        throw new Error("retrySend: Conversation didn't have groupId");
      }

      const groupV2 = initialGroupV2
        ? {
            ...initialGroupV2,
            members: recipients,
          }
        : undefined;
      const groupV1 = groupV2
        ? undefined
        : {
            id: groupId,
            members: recipients,
          };

      // Important to ensure that we don't consider this receipient list to be the entire
      //   member list.
      const partialSend = true;

      promise = window.Signal.Util.sendToGroup(
        {
          messageText: body,
          timestamp: this.get('sent_at'),
          attachments,
          quote: quoteWithData,
          preview: previewWithData,
          sticker: stickerWithData,
          expireTimer: this.get('expireTimer'),
          mentions: this.get('bodyRanges'),
          profileKey,
          groupV2,
          groupV1,
        },
        conversation,
        ContentHint.RESENDABLE,
        options,
        partialSend
      );
    }

    return this.send(handleMessageSend(promise));
  }

  // eslint-disable-next-line class-methods-use-this
  isReplayableError(e: Error): boolean {
    return (
      e.name === 'MessageError' ||
      e.name === 'OutgoingMessageError' ||
      e.name === 'SendMessageNetworkError' ||
      e.name === 'SendMessageChallengeError' ||
      e.name === 'SignedPreKeyRotationError' ||
      e.name === 'OutgoingIdentityKeyError'
    );
  }

  public hasSuccessfulDelivery(): boolean {
    const recipients = this.get('recipients') || [];
    if (recipients.length === 0) {
      return true;
    }

    return (this.get('sent_to') || []).length !== 0;
  }

  // Called when the user ran into an error with a specific user, wants to send to them
  //   One caller today: ConversationView.forceSend()
  async resend(identifier: string): Promise<void | null | Array<void>> {
    const error = this.removeOutgoingErrors(identifier);
    if (!error) {
      window.log.warn(
        'resend: requested number was not present in errors. continuing.'
      );
    }

    if (this.isErased()) {
      window.log.warn('resend: message is erased; refusing to resend');
      return null;
    }

    const profileKey = undefined;
    const attachmentsWithData = await Promise.all(
      (this.get('attachments') || []).map(loadAttachmentData)
    );
    const {
      body,
      attachments,
    } = window.Whisper.Message.getLongMessageAttachment({
      body: this.get('body'),
      attachments: attachmentsWithData,
      now: this.get('sent_at'),
    });

    const quoteWithData = await loadQuoteData(this.get('quote'));
    const previewWithData = await loadPreviewData(this.get('preview'));
    const stickerWithData = await loadStickerData(this.get('sticker'));

    // Special-case the self-send case - we send only a sync message
    if (identifier === this.OUR_NUMBER || identifier === this.OUR_UUID) {
      const dataMessage = await window.textsecure.messaging.getDataMessage({
        attachments,
        body,
        deletedForEveryoneTimestamp: this.get('deletedForEveryoneTimestamp'),
        expireTimer: this.get('expireTimer'),
        mentions: this.get('bodyRanges'),
        preview: previewWithData,
        profileKey,
        quote: quoteWithData,
        reaction: null,
        recipients: [identifier],
        sticker: stickerWithData,
        timestamp: this.get('sent_at'),
      });
      return this.sendSyncMessageOnly(dataMessage);
    }

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;
    const parentConversation = this.getConversation();
    const groupId = parentConversation?.get('groupId');
    const {
      wrap,
      sendOptions,
    } = await window.ConversationController.prepareForSend(identifier);
    const group =
      groupId && isGroupV1(parentConversation?.attributes)
        ? {
            id: groupId,
            type: window.textsecure.protobuf.GroupContext.Type.DELIVER,
          }
        : undefined;

    const timestamp = this.get('sent_at');
    const contentMessage = await window.textsecure.messaging.getContentMessage({
      attachments,
      body,
      expireTimer: this.get('expireTimer'),
      group,
      groupV2: parentConversation?.getGroupV2Info(),
      preview: previewWithData,
      quote: quoteWithData,
      mentions: this.get('bodyRanges'),
      recipients: [identifier],
      sticker: stickerWithData,
      timestamp,
    });

    if (parentConversation) {
      const senderKeyInfo = parentConversation.get('senderKeyInfo');
      if (senderKeyInfo && senderKeyInfo.distributionId) {
        const senderKeyDistributionMessage = await window.textsecure.messaging.getSenderKeyDistributionMessage(
          senderKeyInfo.distributionId
        );

        window.dcodeIO.ByteBuffer.wrap(
          window.Signal.Crypto.typedArrayToArrayBuffer(
            senderKeyDistributionMessage.serialize()
          )
        );
      }
    }

    const promise = window.textsecure.messaging.sendMessageProtoAndWait(
      timestamp,
      [identifier],
      contentMessage,
      ContentHint.RESENDABLE,
      groupId && isGroupV2(parentConversation?.attributes)
        ? groupId
        : undefined,
      sendOptions
    );

    return this.send(wrap(promise));
  }

  removeOutgoingErrors(incomingIdentifier: string): CustomError {
    const incomingConversationId = window.ConversationController.getConversationId(
      incomingIdentifier
    );
    const errors = _.partition(
      this.get('errors'),
      e =>
        window.ConversationController.getConversationId(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          e.identifier || e.number!
        ) === incomingConversationId &&
        (e.name === 'MessageError' ||
          e.name === 'OutgoingMessageError' ||
          e.name === 'SendMessageNetworkError' ||
          e.name === 'SendMessageChallengeError' ||
          e.name === 'SignedPreKeyRotationError' ||
          e.name === 'OutgoingIdentityKeyError')
    );
    this.set({ errors: errors[1] });
    return errors[0][0];
  }

  async send(
    promise: Promise<CallbackResultType | void | null>
  ): Promise<void | Array<void>> {
    const conversation = this.getConversation();
    const updateLeftPane = conversation?.debouncedUpdateLastMessage;
    if (updateLeftPane) {
      updateLeftPane();
    }

    return (promise as Promise<CallbackResultType>)
      .then(async result => {
        if (updateLeftPane) {
          updateLeftPane();
        }

        // This is used by sendSyncMessage, then set to null
        if (result.dataMessage) {
          this.set({ dataMessage: result.dataMessage });
        }

        const sentTo = this.get('sent_to') || [];
        this.set({
          sent_to: _.union(sentTo, result.successfulIdentifiers),
          sent: true,
          expirationStartTimestamp: Date.now(),
          unidentifiedDeliveries: _.union(
            this.get('unidentifiedDeliveries') || [],
            result.unidentifiedDeliveries
          ),
        });

        if (!this.doNotSave) {
          await window.Signal.Data.saveMessage(this.attributes, {
            Message: window.Whisper.Message,
          });
        }

        if (updateLeftPane) {
          updateLeftPane();
        }
        this.sendSyncMessage();
      })
      .catch((result: CustomError | CallbackResultType) => {
        if (updateLeftPane) {
          updateLeftPane();
        }

        if ('dataMessage' in result && result.dataMessage) {
          this.set({ dataMessage: result.dataMessage });
        }

        let promises = [];

        // If we successfully sent to a user, we can remove our unregistered flag.
        let successfulIdentifiers: Array<string>;
        if ('successfulIdentifiers' in result) {
          ({ successfulIdentifiers = [] } = result);
        } else {
          successfulIdentifiers = [];
        }
        successfulIdentifiers.forEach((identifier: string) => {
          const c = window.ConversationController.get(identifier);
          if (c && c.isEverUnregistered()) {
            c.setRegistered();
          }
        });

        const isError = (e: unknown): e is CustomError => e instanceof Error;

        if (isError(result)) {
          this.saveErrors(result);
          if (result.name === 'SignedPreKeyRotationError') {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            promises.push(window.getAccountManager()!.rotateSignedPreKey());
          } else if (result.name === 'OutgoingIdentityKeyError') {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const c = window.ConversationController.get(result.number)!;
            promises.push(c.getProfiles());
          }
        } else {
          if (successfulIdentifiers.length > 0) {
            const sentTo = this.get('sent_to') || [];

            // If we just found out that we couldn't send to a user because they are no
            //   longer registered, we will update our unregistered flag. In groups we
            //   will not event try to send to them for 6 hours. And we will never try
            //   to fetch them on startup again.
            // The way to discover registration once more is:
            //   1) any attempt to send to them in 1:1 conversation
            //   2) the six-hour time period has passed and we send in a group again
            const unregisteredUserErrors = _.filter(
              result.errors,
              error => error.name === 'UnregisteredUserError'
            );
            unregisteredUserErrors.forEach(error => {
              const c = window.ConversationController.get(error.identifier);
              if (c) {
                c.setUnregistered();
              }
            });

            // In groups, we don't treat unregistered users as a user-visible
            //   error. The message will look successful, but the details
            //   screen will show that we didn't send to these unregistered users.
            const filteredErrors = _.reject(
              result.errors,
              error => error.name === 'UnregisteredUserError'
            );

            // We don't start the expiration timer if there are real errors
            //   left after filtering out all of the unregistered user errors.
            const expirationStartTimestamp = filteredErrors.length
              ? null
              : Date.now();

            this.saveErrors(filteredErrors);

            this.set({
              sent_to: _.union(sentTo, result.successfulIdentifiers),
              sent: true,
              expirationStartTimestamp,
              unidentifiedDeliveries: _.union(
                this.get('unidentifiedDeliveries') || [],
                result.unidentifiedDeliveries
              ),
            });
            promises.push(this.sendSyncMessage());
          } else if (result.errors) {
            this.saveErrors(result.errors);
          }
          promises = promises.concat(
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            _.map(result.errors, error => {
              if (error.name === 'OutgoingIdentityKeyError') {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const c = window.ConversationController.get(
                  error.identifier || error.number
                )!;
                promises.push(c.getProfiles());
              }
            })
          );
        }

        if (updateLeftPane) {
          updateLeftPane();
        }

        return Promise.all(promises);
      });
  }

  // Currently used only for messages that have to be retried when the server
  // responds with 428 and we have to retry sending the message on challenge
  // solution.
  //
  // Supported types of messages:
  // * `session-reset` see `endSession` in `ts/models/conversations.ts`
  async sendUtilityMessageWithRetry(options: RetryOptions): Promise<void> {
    if (options.type === 'session-reset') {
      const conv = this.getConversation();
      if (!conv) {
        throw new Error(
          `Failed to find conversation for message: ${this.idForLogging()}`
        );
      }
      if (!window.textsecure.messaging) {
        throw new Error('Offline');
      }

      this.set({
        retryOptions: options,
      });

      const sendOptions = await getSendOptions(conv.attributes);

      // We don't have to check `sent_to` here, because:
      //
      // 1. This happens only in private conversations
      // 2. Messages to different device ids for the same identifier are sent
      //    in a single request to the server. So partial success is not
      //    possible.
      await this.send(
        handleMessageSend(
          // TODO: DESKTOP-724
          // resetSession returns `Array<void>` which is incompatible with the
          // expected promise return values. `[]` is truthy and handleMessageSend
          // assumes it's a valid callback result type
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          window.textsecure.messaging.resetSession(
            options.uuid,
            options.e164,
            options.now,
            sendOptions
          )
        )
      );

      return;
    }

    throw new Error(`Unsupported retriable type: ${options.type}`);
  }

  async sendSyncMessageOnly(dataMessage: ArrayBuffer): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const conv = this.getConversation()!;
    this.set({ dataMessage });

    const updateLeftPane = conv?.debouncedUpdateLastMessage;

    try {
      this.set({
        // These are the same as a normal send()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        sent_to: [conv.getSendTarget()!],
        sent: true,
        expirationStartTimestamp: Date.now(),
      });
      const result: typeof window.WhatIsThis = await this.sendSyncMessage();
      this.set({
        // We have to do this afterward, since we didn't have a previous send!
        unidentifiedDeliveries: result ? result.unidentifiedDeliveries : null,

        // These are unique to a Note to Self message - immediately read/delivered
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        delivered_to: [window.ConversationController.getOurConversationId()!],
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        read_by: [window.ConversationController.getOurConversationId()!],
      });
    } catch (result) {
      const errors = (result && result.errors) || [new Error('Unknown error')];
      this.saveErrors(errors);
    } finally {
      await window.Signal.Data.saveMessage(this.attributes, {
        Message: window.Whisper.Message,
      });

      if (updateLeftPane) {
        updateLeftPane();
      }
    }
  }

  async sendSyncMessage(): Promise<WhatIsThis> {
    const ourNumber = window.textsecure.storage.user.getNumber();
    const ourUuid = window.textsecure.storage.user.getUuid();
    const {
      wrap,
      sendOptions,
    } = await window.ConversationController.prepareForSend(
      ourUuid || ourNumber,
      {
        syncMessage: true,
      }
    );

    this.syncPromise = this.syncPromise || Promise.resolve();
    const next = async () => {
      const dataMessage = this.get('dataMessage');
      if (!dataMessage) {
        return Promise.resolve();
      }
      const isUpdate = Boolean(this.get('synced'));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const conv = this.getConversation()!;

      return wrap(
        window.textsecure.messaging.sendSyncMessage(
          dataMessage,
          this.get('sent_at'),
          conv.get('e164'),
          conv.get('uuid'),
          this.get('expirationStartTimestamp') || null,
          this.get('sent_to'),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.get('unidentifiedDeliveries')!,
          isUpdate,
          sendOptions
        )
      ).then(async (result: unknown) => {
        this.set({
          synced: true,
          dataMessage: null,
        });

        // Return early, skip the save
        if (this.doNotSave) {
          return result;
        }

        await window.Signal.Data.saveMessage(this.attributes, {
          Message: window.Whisper.Message,
        });
        return result;
      });
    };

    this.syncPromise = this.syncPromise.then(next, next);

    return this.syncPromise;
  }

  hasRequiredAttachmentDownloads(): boolean {
    const attachments: ReadonlyArray<AttachmentType> =
      this.get('attachments') || [];

    const hasLongMessageAttachments = attachments.some(attachment => {
      return MIME.isLongMessage(attachment.contentType);
    });

    if (hasLongMessageAttachments) {
      return true;
    }

    const sticker = this.get('sticker');
    if (sticker) {
      return !sticker.data || !sticker.data.path;
    }

    return false;
  }

  getLastChallengeError(): ShallowChallengeError | undefined {
    return getLastChallengeError(this.attributes);
  }

  // NOTE: If you're modifying this function then you'll likely also need
  // to modify queueAttachmentDownloads since it contains the logic below
  hasAttachmentDownloads(): boolean {
    const attachments = this.get('attachments') || [];

    const [longMessageAttachments, normalAttachments] = _.partition(
      attachments,
      attachment => MIME.isLongMessage(attachment.contentType)
    );

    if (longMessageAttachments.length > 0) {
      return true;
    }

    const hasNormalAttachments = normalAttachments.some(attachment => {
      if (!attachment) {
        return false;
      }
      // We've already downloaded this!
      if (attachment.path) {
        return false;
      }
      return true;
    });
    if (hasNormalAttachments) {
      return true;
    }

    const previews = this.get('preview') || [];
    const hasPreviews = previews.some(item => {
      if (!item.image) {
        return false;
      }
      // We've already downloaded this!
      if (item.image.path) {
        return false;
      }
      return true;
    });
    if (hasPreviews) {
      return true;
    }

    const contacts = this.get('contact') || [];
    const hasContacts = contacts.some(item => {
      if (!item.avatar || !item.avatar.avatar) {
        return false;
      }
      if (item.avatar.avatar.path) {
        return false;
      }
      return true;
    });
    if (hasContacts) {
      return true;
    }

    const quote = this.get('quote');
    const quoteAttachments =
      quote && quote.attachments ? quote.attachments : [];
    const hasQuoteAttachments = quoteAttachments.some(item => {
      if (!item.thumbnail) {
        return false;
      }
      // We've already downloaded this!
      if (item.thumbnail.path) {
        return false;
      }
      return true;
    });
    if (hasQuoteAttachments) {
      return true;
    }

    const sticker = this.get('sticker');
    if (sticker) {
      return !sticker.data || (sticker.data && !sticker.data.path);
    }

    return false;
  }

  // Receive logic
  // NOTE: If you're changing any logic in this function that deals with the
  // count then you'll also have to modify the above function
  // hasAttachmentDownloads
  async queueAttachmentDownloads(): Promise<boolean> {
    const attachmentsToQueue = this.get('attachments') || [];
    const messageId = this.id;
    let count = 0;
    let bodyPending;

    window.log.info(
      `Queueing ${
        attachmentsToQueue.length
      } attachment downloads for message ${this.idForLogging()}`
    );

    const [
      longMessageAttachments,
      normalAttachments,
    ] = _.partition(attachmentsToQueue, attachment =>
      MIME.isLongMessage(attachment.contentType)
    );

    if (longMessageAttachments.length > 1) {
      window.log.error(
        `Received more than one long message attachment in message ${this.idForLogging()}`
      );
    }

    window.log.info(
      `Queueing ${
        longMessageAttachments.length
      } long message attachment downloads for message ${this.idForLogging()}`
    );

    if (longMessageAttachments.length > 0) {
      count += 1;
      bodyPending = true;
      await AttachmentDownloads.addJob(longMessageAttachments[0], {
        messageId,
        type: 'long-message',
        index: 0,
      });
    }

    window.log.info(
      `Queueing ${
        normalAttachments.length
      } normal attachment downloads for message ${this.idForLogging()}`
    );
    const attachments = await Promise.all(
      normalAttachments.map((attachment, index) => {
        if (!attachment) {
          return attachment;
        }
        // We've already downloaded this!
        if (attachment.path) {
          window.log.info(
            `Normal attachment already downloaded for message ${this.idForLogging()}`
          );
          return attachment;
        }

        count += 1;

        return AttachmentDownloads.addJob(attachment, {
          messageId,
          type: 'attachment',
          index,
        });
      })
    );

    const previewsToQueue = this.get('preview') || [];
    window.log.info(
      `Queueing ${
        previewsToQueue.length
      } preview attachment downloads for message ${this.idForLogging()}`
    );
    const preview = await Promise.all(
      previewsToQueue.map(async (item, index) => {
        if (!item.image) {
          return item;
        }
        // We've already downloaded this!
        if (item.image.path) {
          window.log.info(
            `Preview attachment already downloaded for message ${this.idForLogging()}`
          );
          return item;
        }

        count += 1;
        return {
          ...item,
          image: await AttachmentDownloads.addJob(item.image, {
            messageId,
            type: 'preview',
            index,
          }),
        };
      })
    );

    const contactsToQueue = this.get('contact') || [];
    window.log.info(
      `Queueing ${
        contactsToQueue.length
      } contact attachment downloads for message ${this.idForLogging()}`
    );
    const contact = await Promise.all(
      contactsToQueue.map(async (item, index) => {
        if (!item.avatar || !item.avatar.avatar) {
          return item;
        }
        // We've already downloaded this!
        if (item.avatar.avatar.path) {
          window.log.info(
            `Contact attachment already downloaded for message ${this.idForLogging()}`
          );
          return item;
        }

        count += 1;
        return {
          ...item,
          avatar: {
            ...item.avatar,
            avatar: await AttachmentDownloads.addJob(item.avatar.avatar, {
              messageId,
              type: 'contact',
              index,
            }),
          },
        };
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let quote = this.get('quote')!;
    const quoteAttachmentsToQueue =
      quote && quote.attachments ? quote.attachments : [];
    window.log.info(
      `Queueing ${
        quoteAttachmentsToQueue.length
      } quote attachment downloads for message ${this.idForLogging()}`
    );
    if (quoteAttachmentsToQueue.length > 0) {
      quote = {
        ...quote,
        attachments: await Promise.all(
          (quote.attachments || []).map(async (item, index) => {
            if (!item.thumbnail) {
              return item;
            }
            // We've already downloaded this!
            if (item.thumbnail.path) {
              window.log.info(
                `Quote attachment already downloaded for message ${this.idForLogging()}`
              );
              return item;
            }

            count += 1;
            return {
              ...item,
              thumbnail: await AttachmentDownloads.addJob(item.thumbnail, {
                messageId,
                type: 'quote',
                index,
              }),
            };
          })
        ),
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let sticker = this.get('sticker')!;
    if (sticker && sticker.data && sticker.data.path) {
      window.log.info(
        `Sticker attachment already downloaded for message ${this.idForLogging()}`
      );
    } else if (sticker) {
      window.log.info(
        `Queueing sticker download for message ${this.idForLogging()}`
      );
      count += 1;
      const { packId, stickerId, packKey } = sticker;

      const status = getStickerPackStatus(packId);
      let data: AttachmentType | undefined;

      if (status && (status === 'downloaded' || status === 'installed')) {
        try {
          const copiedSticker = await copyStickerToAttachments(
            packId,
            stickerId
          );
          data = {
            ...copiedSticker,
            contentType: IMAGE_WEBP,
          };
        } catch (error) {
          window.log.error(
            `Problem copying sticker (${packId}, ${stickerId}) to attachments:`,
            error && error.stack ? error.stack : error
          );
        }
      }
      if (!data && sticker.data) {
        data = await AttachmentDownloads.addJob(sticker.data, {
          messageId,
          type: 'sticker',
          index: 0,
        });
      }
      if (!status) {
        // Save the packId/packKey for future download/install
        savePackMetadata(packId, packKey, { messageId });
      } else {
        await addStickerPackReference(messageId, packId);
      }

      if (!data) {
        throw new Error(
          'queueAttachmentDownloads: Failed to fetch sticker data'
        );
      }

      sticker = {
        ...sticker,
        packId,
        data,
      };
    }

    window.log.info(
      `Queued ${count} total attachment downloads for message ${this.idForLogging()}`
    );

    if (count > 0) {
      this.set({
        bodyPending,
        attachments,
        preview,
        contact,
        quote,
        sticker,
      });

      return true;
    }

    return false;
  }

  markAttachmentAsCorrupted(attachment: AttachmentType): void {
    if (!attachment.path) {
      throw new Error(
        "Attachment can't be marked as corrupted because it wasn't loaded"
      );
    }

    // We intentionally don't check in quotes/stickers/contacts/... here,
    // because this function should be called only for something that can
    // be displayed as a generic attachment.
    const attachments: ReadonlyArray<AttachmentType> =
      this.get('attachments') || [];

    let changed = false;
    const newAttachments = attachments.map(existing => {
      if (existing.path !== attachment.path) {
        return existing;
      }
      changed = true;

      return {
        ...existing,
        isCorrupted: true,
      };
    });

    if (!changed) {
      throw new Error(
        "Attachment can't be marked as corrupted because it wasn't found"
      );
    }

    window.log.info(
      'markAttachmentAsCorrupted: marking an attachment as corrupted'
    );

    this.set({
      attachments: newAttachments,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  async copyFromQuotedMessage(
    message: DataMessageClass,
    conversationId: string
  ): Promise<DataMessageClass> {
    const { quote } = message;
    if (!quote) {
      return message;
    }

    const { id } = quote;
    const inMemoryMessages = window.MessageController.filterBySentAt(id);
    const matchingMessage = find(inMemoryMessages, item =>
      isQuoteAMatch(item, conversationId, quote)
    );

    let queryMessage: undefined | MessageModel;

    if (matchingMessage) {
      queryMessage = matchingMessage;
    } else {
      window.log.info('copyFromQuotedMessage: db lookup needed', id);
      const collection = await window.Signal.Data.getMessagesBySentAt(id, {
        MessageCollection: window.Whisper.MessageCollection,
      });
      const found = collection.find(item =>
        isQuoteAMatch(item, conversationId, quote)
      );

      if (!found) {
        quote.referencedMessageNotFound = true;
        return message;
      }

      queryMessage = window.MessageController.register(found.id, found);
    }

    if (queryMessage) {
      await this.copyQuoteContentFromOriginal(queryMessage, quote);
    }

    return message;
  }

  // eslint-disable-next-line class-methods-use-this
  async copyQuoteContentFromOriginal(
    originalMessage: MessageModel,
    quote: QuotedMessageType | DataMessageClass.Quote
  ): Promise<void> {
    const { attachments } = quote;
    const firstAttachment = attachments ? attachments[0] : undefined;

    if (isTapToView(originalMessage.attributes)) {
      // eslint-disable-next-line no-param-reassign
      quote.text = null;
      // eslint-disable-next-line no-param-reassign
      quote.attachments = [
        {
          contentType: 'image/jpeg',
        },
      ];
      // eslint-disable-next-line no-param-reassign
      quote.isViewOnce = true;

      return;
    }

    // eslint-disable-next-line no-param-reassign
    quote.isViewOnce = false;

    // eslint-disable-next-line no-param-reassign
    quote.text = originalMessage.get('body');
    if (firstAttachment) {
      firstAttachment.thumbnail = undefined;
    }

    if (
      !firstAttachment ||
      !firstAttachment.contentType ||
      (!GoogleChrome.isImageTypeSupported(
        firstAttachment.contentType as MIMEType
      ) &&
        !GoogleChrome.isVideoTypeSupported(
          firstAttachment.contentType as MIMEType
        ))
    ) {
      return;
    }

    try {
      const schemaVersion = originalMessage.get('schemaVersion');
      if (
        schemaVersion &&
        schemaVersion < TypedMessage.VERSION_NEEDED_FOR_DISPLAY
      ) {
        const upgradedMessage = await upgradeMessageSchema(
          originalMessage.attributes
        );
        originalMessage.set(upgradedMessage);
        await window.Signal.Data.saveMessage(upgradedMessage, {
          Message: window.Whisper.Message,
        });
      }
    } catch (error) {
      window.log.error(
        'Problem upgrading message quoted message from database',
        Errors.toLogFormat(error)
      );
      return;
    }

    const queryAttachments = originalMessage.get('attachments') || [];
    if (queryAttachments.length > 0) {
      const queryFirst = queryAttachments[0];
      const { thumbnail } = queryFirst;

      if (thumbnail && thumbnail.path) {
        firstAttachment.thumbnail = {
          ...thumbnail,
          copied: true,
        };
      }
    }

    const queryPreview = originalMessage.get('preview') || [];
    if (queryPreview.length > 0) {
      const queryFirst = queryPreview[0];
      const { image } = queryFirst;

      if (image && image.path) {
        firstAttachment.thumbnail = {
          ...image,
          copied: true,
        };
      }
    }

    const sticker = originalMessage.get('sticker');
    if (sticker && sticker.data && sticker.data.path) {
      firstAttachment.thumbnail = {
        ...sticker.data,
        copied: true,
      };
    }
  }

  handleDataMessage(
    initialMessage: DataMessageClass,
    confirm: () => void,
    options: { data?: typeof window.WhatIsThis } = {}
  ): WhatIsThis {
    const { data } = options;

    // This function is called from the background script in a few scenarios:
    //   1. on an incoming message
    //   2. on a sent message sync'd from another device
    //   3. in rare cases, an incoming message can be retried, though it will
    //      still go through one of the previous two codepaths
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const message = this;
    const source = message.get('source');
    const sourceUuid = message.get('sourceUuid');
    const type = message.get('type');
    const conversationId = message.get('conversationId');
    const GROUP_TYPES = window.textsecure.protobuf.GroupContext.Type;

    const fromContact = this.getContact();
    if (fromContact) {
      fromContact.setRegistered();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const conversation = window.ConversationController.get(conversationId)!;
    return conversation.queueJob('handleDataMessage', async () => {
      window.log.info(
        `Starting handleDataMessage for message ${message.idForLogging()} in conversation ${conversation.idForLogging()}`
      );

      // First, check for duplicates. If we find one, stop processing here.
      const inMemoryMessage = window.MessageController.findBySender(
        this.getSenderIdentifier()
      );
      if (inMemoryMessage) {
        window.log.info(
          'handleDataMessage: cache hit',
          this.getSenderIdentifier()
        );
      } else {
        window.log.info(
          'handleDataMessage: duplicate check db lookup needed',
          this.getSenderIdentifier()
        );
      }
      const existingMessage =
        inMemoryMessage ||
        (await getMessageBySender(this.attributes, {
          Message: window.Whisper.Message,
        }));
      const isUpdate = Boolean(data && data.isRecipientUpdate);

      if (existingMessage && type === 'incoming') {
        window.log.warn('Received duplicate message', this.idForLogging());
        confirm();
        return;
      }
      if (type === 'outgoing') {
        if (isUpdate && existingMessage) {
          window.log.info(
            `handleDataMessage: Updating message ${message.idForLogging()} with received transcript`
          );

          let sentTo = [];
          let unidentifiedDeliveries = [];
          if (Array.isArray(data.unidentifiedStatus)) {
            sentTo = data.unidentifiedStatus.map(
              (item: typeof window.WhatIsThis) => item.destination
            );

            const unidentified = _.filter(data.unidentifiedStatus, item =>
              Boolean(item.unidentified)
            );
            unidentifiedDeliveries = unidentified.map(item => item.destination);
          }

          const toUpdate = window.MessageController.register(
            existingMessage.id,
            existingMessage
          );
          toUpdate.set({
            sent_to: _.union(toUpdate.get('sent_to'), sentTo),
            unidentifiedDeliveries: _.union(
              toUpdate.get('unidentifiedDeliveries'),
              unidentifiedDeliveries
            ),
          });
          await window.Signal.Data.saveMessage(toUpdate.attributes, {
            Message: window.Whisper.Message,
          });

          confirm();
          return;
        }
        if (isUpdate) {
          window.log.warn(
            `handleDataMessage: Received update transcript, but no existing entry for message ${message.idForLogging()}. Dropping.`
          );

          confirm();
          return;
        }
        if (existingMessage) {
          window.log.warn(
            `handleDataMessage: Received duplicate transcript for message ${message.idForLogging()}, but it was not an update transcript. Dropping.`
          );

          confirm();
          return;
        }
      }

      // Now check for decryption error placeholders
      const { retryPlaceholders } = window.Signal.Services;
      if (retryPlaceholders) {
        const item = await retryPlaceholders.findByMessageAndRemove(
          conversationId,
          message.get('sent_at')
        );
        if (item && item.wasOpened) {
          window.log.info(
            `handleDataMessage: found retry placeholder for ${message.idForLogging()}, but conversation was opened. No updates made.`
          );
        } else if (item) {
          window.log.info(
            `handleDataMessage: found retry placeholder for ${message.idForLogging()}. Updating received_at/received_at_ms`
          );
          message.set({
            received_at: item.receivedAtCounter,
            received_at_ms: item.receivedAt,
          });
        }
      }

      // GroupV2

      if (initialMessage.groupV2) {
        if (isGroupV1(conversation.attributes)) {
          // If we received a GroupV2 message in a GroupV1 group, we migrate!

          const { revision, groupChange } = initialMessage.groupV2;
          await window.Signal.Groups.respondToGroupV2Migration({
            conversation,
            groupChangeBase64: groupChange,
            newRevision: revision,
            receivedAt: message.get('received_at'),
            sentAt: message.get('sent_at'),
          });
        } else if (
          initialMessage.groupV2.masterKey &&
          initialMessage.groupV2.secretParams &&
          initialMessage.groupV2.publicParams
        ) {
          // Repair core GroupV2 data if needed
          await conversation.maybeRepairGroupV2({
            masterKey: initialMessage.groupV2.masterKey,
            secretParams: initialMessage.groupV2.secretParams,
            publicParams: initialMessage.groupV2.publicParams,
          });

          // Standard GroupV2 modification codepath
          const existingRevision = conversation.get('revision');
          const isV2GroupUpdate =
            initialMessage.groupV2 &&
            _.isNumber(initialMessage.groupV2.revision) &&
            (!existingRevision ||
              initialMessage.groupV2.revision > existingRevision);

          if (isV2GroupUpdate && initialMessage.groupV2) {
            const { revision, groupChange } = initialMessage.groupV2;
            try {
              await window.Signal.Groups.maybeUpdateGroup({
                conversation,
                groupChangeBase64: groupChange,
                newRevision: revision,
                receivedAt: message.get('received_at'),
                sentAt: message.get('sent_at'),
              });
            } catch (error) {
              const errorText = error && error.stack ? error.stack : error;
              window.log.error(
                `handleDataMessage: Failed to process group update for ${conversation.idForLogging()} as part of message ${message.idForLogging()}: ${errorText}`
              );
              throw error;
            }
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const ourConversationId = window.ConversationController.getOurConversationId()!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const senderId = window.ConversationController.ensureContactIds({
        e164: source,
        uuid: sourceUuid,
      })!;
      const hasGroupV2Prop = Boolean(initialMessage.groupV2);
      const isV1GroupUpdate =
        initialMessage.group &&
        initialMessage.group.type !==
          window.textsecure.protobuf.GroupContext.Type.DELIVER;

      // Drop an incoming GroupV2 message if we or the sender are not part of the group
      //   after applying the message's associated group changes.
      if (
        type === 'incoming' &&
        !isDirectConversation(conversation.attributes) &&
        hasGroupV2Prop &&
        (conversation.get('left') ||
          !conversation.hasMember(ourConversationId) ||
          !conversation.hasMember(senderId))
      ) {
        window.log.warn(
          `Received message destined for group ${conversation.idForLogging()}, which we or the sender are not a part of. Dropping.`
        );
        confirm();
        return;
      }

      // We drop incoming messages for v1 groups we already know about, which we're not
      //   a part of, except for group updates. Because group v1 updates haven't been
      //   applied by this point.
      // Note: if we have no information about a group at all, we will accept those
      //   messages. We detect that via a missing 'members' field.
      if (
        type === 'incoming' &&
        !isDirectConversation(conversation.attributes) &&
        !hasGroupV2Prop &&
        !isV1GroupUpdate &&
        conversation.get('members') &&
        (conversation.get('left') || !conversation.hasMember(ourConversationId))
      ) {
        window.log.warn(
          `Received message destined for group ${conversation.idForLogging()}, which we're not a part of. Dropping.`
        );
        confirm();
        return;
      }

      // Because GroupV1 messages can now be multiplexed into GroupV2 conversations, we
      //   drop GroupV1 updates in GroupV2 groups.
      if (isV1GroupUpdate && isGroupV2(conversation.attributes)) {
        window.log.warn(
          `Received GroupV1 update in GroupV2 conversation ${conversation.idForLogging()}. Dropping.`
        );
        confirm();
        return;
      }

      // Send delivery receipts, but only for incoming sealed sender messages
      // and not for messages from unaccepted conversations
      if (
        type === 'incoming' &&
        this.get('unidentifiedDeliveryReceived') &&
        !hasErrors(this.attributes) &&
        conversation.getAccepted()
      ) {
        // Note: We both queue and batch because we want to wait until we are done
        //   processing incoming messages to start sending outgoing delivery receipts.
        //   The queue can be paused easily.
        window.Whisper.deliveryReceiptQueue.add(() => {
          window.Whisper.deliveryReceiptBatcher.add({
            source,
            sourceUuid,
            timestamp: this.get('sent_at'),
          });
        });
      }

      const withQuoteReference = await this.copyFromQuotedMessage(
        initialMessage,
        conversation.id
      );
      const dataMessage = await upgradeMessageSchema(withQuoteReference);

      try {
        const now = new Date().getTime();

        const urls = window.Signal.LinkPreviews.findLinks(dataMessage.body);
        const incomingPreview = dataMessage.preview || [];
        const preview = incomingPreview.filter(
          (item: typeof window.WhatIsThis) =>
            (item.image || item.title) &&
            urls.includes(item.url) &&
            window.Signal.LinkPreviews.isLinkSafeToPreview(item.url)
        );
        if (preview.length < incomingPreview.length) {
          window.log.info(
            `${message.idForLogging()}: Eliminated ${
              preview.length - incomingPreview.length
            } previews with invalid urls'`
          );
        }

        message.set({
          id: window.getGuid(),
          attachments: dataMessage.attachments,
          body: dataMessage.body,
          bodyRanges: dataMessage.bodyRanges,
          contact: dataMessage.contact,
          conversationId: conversation.id,
          decrypted_at: now,
          errors: [],
          flags: dataMessage.flags,
          hasAttachments: dataMessage.hasAttachments,
          hasFileAttachments: dataMessage.hasFileAttachments,
          hasVisualMediaAttachments: dataMessage.hasVisualMediaAttachments,
          isViewOnce: Boolean(dataMessage.isViewOnce),
          preview,
          requiredProtocolVersion:
            dataMessage.requiredProtocolVersion ||
            this.INITIAL_PROTOCOL_VERSION,
          supportedVersionAtReceive: this.CURRENT_PROTOCOL_VERSION,
          quote: dataMessage.quote,
          schemaVersion: dataMessage.schemaVersion,
          sticker: dataMessage.sticker,
        });

        const isSupported = !isUnsupportedMessage(message.attributes);
        if (!isSupported) {
          await message.eraseContents();
        }

        if (isSupported) {
          let attributes = {
            ...conversation.attributes,
          };

          // GroupV1
          if (!hasGroupV2Prop && dataMessage.group) {
            const pendingGroupUpdate: GroupV1Update = {};

            const memberConversations: Array<ConversationModel> = await Promise.all(
              dataMessage.group.membersE164.map((e164: string) =>
                window.ConversationController.getOrCreateAndWait(
                  e164,
                  'private'
                )
              )
            );
            const members = memberConversations.map(c => c.get('id'));
            attributes = {
              ...attributes,
              type: 'group',
              groupId: dataMessage.group.id,
            };
            if (dataMessage.group.type === GROUP_TYPES.UPDATE) {
              attributes = {
                ...attributes,
                name: dataMessage.group.name,
                members: _.union(members, conversation.get('members')),
              };

              if (dataMessage.group.name !== conversation.get('name')) {
                pendingGroupUpdate.name = dataMessage.group.name;
              }

              const avatarAttachment = dataMessage.group.avatar;

              let downloadedAvatar;
              let hash;
              if (avatarAttachment) {
                try {
                  downloadedAvatar = await window.Signal.Util.downloadAttachment(
                    avatarAttachment
                  );

                  if (downloadedAvatar) {
                    const loadedAttachment = await window.Signal.Migrations.loadAttachmentData(
                      downloadedAvatar
                    );

                    hash = await window.Signal.Types.Conversation.computeHash(
                      loadedAttachment.data
                    );
                  }
                } catch (err) {
                  window.log.info(
                    'handleDataMessage: group avatar download failed'
                  );
                }
              }

              const existingAvatar = conversation.get('avatar');

              if (
                // Avatar added
                (!existingAvatar && avatarAttachment) ||
                // Avatar changed
                (existingAvatar && existingAvatar.hash !== hash) ||
                // Avatar removed
                (existingAvatar && !avatarAttachment)
              ) {
                // Removes existing avatar from disk
                if (existingAvatar && existingAvatar.path) {
                  await window.Signal.Migrations.deleteAttachmentData(
                    existingAvatar.path
                  );
                }

                let avatar = null;
                if (downloadedAvatar && avatarAttachment !== null) {
                  const onDiskAttachment = await window.Signal.Types.Attachment.migrateDataToFileSystem(
                    downloadedAvatar,
                    {
                      writeNewAttachmentData:
                        window.Signal.Migrations.writeNewAttachmentData,
                    }
                  );
                  avatar = {
                    ...onDiskAttachment,
                    hash,
                  };
                }

                attributes.avatar = avatar;

                pendingGroupUpdate.avatarUpdated = true;
              } else {
                window.log.info(
                  'handleDataMessage: Group avatar hash matched; not replacing group avatar'
                );
              }

              const difference = _.difference(
                members,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                conversation.get('members')!
              );
              if (difference.length > 0) {
                // Because GroupV1 groups are based on e164 only
                const maybeE164s = map(difference, id =>
                  window.ConversationController.get(id)?.get('e164')
                );
                const e164s = filter(maybeE164s, isNotNil);
                pendingGroupUpdate.joined = [...e164s];
              }
              if (conversation.get('left')) {
                window.log.warn('re-added to a left group');
                attributes.left = false;
                conversation.set({ addedBy: message.getContactId() });
              }
            } else if (dataMessage.group.type === GROUP_TYPES.QUIT) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const sender = window.ConversationController.get(senderId)!;
              const inGroup = Boolean(
                sender &&
                  (conversation.get('members') || []).includes(sender.id)
              );
              if (!inGroup) {
                const senderString = sender ? sender.idForLogging() : null;
                window.log.info(
                  `Got 'left' message from someone not in group: ${senderString}. Dropping.`
                );
                return;
              }

              if (isMe(sender.attributes)) {
                attributes.left = true;
                pendingGroupUpdate.left = 'You';
              } else {
                pendingGroupUpdate.left = sender.get('id');
              }
              attributes.members = _.without(
                conversation.get('members'),
                sender.get('id')
              );
            }

            if (!isEmpty(pendingGroupUpdate)) {
              message.set('group_update', pendingGroupUpdate);
            }
          }

          // Drop empty messages after. This needs to happen after the initial
          // message.set call and after GroupV1 processing to make sure all possible
          // properties are set before we determine that a message is empty.
          if (message.isEmpty()) {
            window.log.info(
              `handleDataMessage: Dropping empty message ${message.idForLogging()} in conversation ${conversation.idForLogging()}`
            );
            confirm();
            return;
          }

          attributes.active_at = now;
          conversation.set(attributes);

          if (dataMessage.expireTimer) {
            message.set({ expireTimer: dataMessage.expireTimer });
          }

          if (!hasGroupV2Prop) {
            if (isExpirationTimerUpdate(message.attributes)) {
              message.set({
                expirationTimerUpdate: {
                  source,
                  sourceUuid,
                  expireTimer: dataMessage.expireTimer,
                },
              });
              conversation.set({ expireTimer: dataMessage.expireTimer });
            }

            // NOTE: Remove once the above calls this.model.updateExpirationTimer()
            const { expireTimer } = dataMessage;
            const shouldLogExpireTimerChange =
              isExpirationTimerUpdate(message.attributes) || expireTimer;
            if (shouldLogExpireTimerChange) {
              window.log.info("Update conversation 'expireTimer'", {
                id: conversation.idForLogging(),
                expireTimer,
                source: 'handleDataMessage',
              });
            }

            if (!isEndSession(message.attributes)) {
              if (dataMessage.expireTimer) {
                if (
                  dataMessage.expireTimer !== conversation.get('expireTimer')
                ) {
                  conversation.updateExpirationTimer(
                    dataMessage.expireTimer,
                    source,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    message.getReceivedAt()!,
                    {
                      fromGroupUpdate: isGroupUpdate(message.attributes),
                    }
                  );
                }
              } else if (
                conversation.get('expireTimer') &&
                // We only turn off timers if it's not a group update
                !isGroupUpdate(message.attributes)
              ) {
                conversation.updateExpirationTimer(
                  undefined,
                  source,
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  message.getReceivedAt()!
                );
              }
            }
          }

          if (dataMessage.profileKey) {
            const profileKey = dataMessage.profileKey.toString('base64');
            if (
              source === window.textsecure.storage.user.getNumber() ||
              sourceUuid === window.textsecure.storage.user.getUuid()
            ) {
              conversation.set({ profileSharing: true });
            } else if (isDirectConversation(conversation.attributes)) {
              conversation.setProfileKey(profileKey);
            } else {
              const localId = window.ConversationController.ensureContactIds({
                e164: source,
                uuid: sourceUuid,
              });
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              window.ConversationController.get(localId)!.setProfileKey(
                profileKey
              );
            }
          }

          if (isTapToView(message.attributes) && type === 'outgoing') {
            await message.eraseContents();
          }

          if (
            type === 'incoming' &&
            isTapToView(message.attributes) &&
            !message.isValidTapToView()
          ) {
            window.log.warn(
              `Received tap to view message ${message.idForLogging()} with invalid data. Erasing contents.`
            );
            message.set({
              isTapToViewInvalid: true,
            });
            await message.eraseContents();
          }
        }

        const conversationTimestamp = conversation.get('timestamp');
        if (
          !conversationTimestamp ||
          message.get('sent_at') > conversationTimestamp
        ) {
          conversation.set({
            lastMessage: message.getNotificationText(),
            timestamp: message.get('sent_at'),
          });
        }

        window.MessageController.register(message.id, message);
        conversation.incrementMessageCount();
        window.Signal.Data.updateConversation(conversation.attributes);

        // Only queue attachments for downloads if this is an outgoing message
        // or we've accepted the conversation
        const reduxState = window.reduxStore.getState();
        const attachments = this.get('attachments') || [];
        const shouldHoldOffDownload =
          (isImage(attachments) || isVideo(attachments)) &&
          isInCall(reduxState);
        if (
          this.hasAttachmentDownloads() &&
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (this.getConversation()!.getAccepted() ||
            isOutgoing(message.attributes)) &&
          !shouldHoldOffDownload
        ) {
          if (window.attachmentDownloadQueue) {
            window.attachmentDownloadQueue.unshift(message);
            window.log.info(
              'Adding to attachmentDownloadQueue',
              message.get('sent_at')
            );
          } else {
            await message.queueAttachmentDownloads();
          }
        }

        const isFirstRun = true;
        await this.modifyTargetMessage(conversation, isFirstRun);

        window.log.info(
          'handleDataMessage: Batching save for',
          message.get('sent_at')
        );
        this.saveAndNotify(conversation, confirm);
      } catch (error) {
        const errorForLog = error && error.stack ? error.stack : error;
        window.log.error(
          'handleDataMessage',
          message.idForLogging(),
          'error:',
          errorForLog
        );
        throw error;
      }
    });
  }

  async saveAndNotify(
    conversation: ConversationModel,
    confirm: () => void
  ): Promise<void> {
    await window.Signal.Util.saveNewMessageBatcher.add(this.attributes);

    window.log.info('Message saved', this.get('sent_at'));

    conversation.trigger('newmessage', this);

    const isFirstRun = false;
    await this.modifyTargetMessage(conversation, isFirstRun);

    if (this.get('unread')) {
      await conversation.notify(this);
    }

    // Increment the sent message count if this is an outgoing message
    if (this.get('type') === 'outgoing') {
      conversation.incrementSentMessageCount();
    }

    window.Whisper.events.trigger('incrementProgress');
    confirm();
  }

  // This function is called twice - once from handleDataMessage, and then again from
  //    saveAndNotify, a function called at the end of handleDataMessage as a cleanup for
  //    any missed out-of-order events.
  async modifyTargetMessage(
    conversation: ConversationModel,
    isFirstRun: boolean
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const message = this;
    const type = message.get('type');
    let changed = false;

    if (type === 'outgoing') {
      const receipts = DeliveryReceipts.getSingleton().forMessage(
        conversation,
        message
      );
      receipts.forEach(receipt => {
        message.set({
          delivered: (message.get('delivered') || 0) + 1,
          delivered_to: _.union(message.get('delivered_to') || [], [
            receipt.get('deliveredTo'),
          ]),
        });
        changed = true;
      });
    }

    if (type === 'incoming') {
      const readSync = ReadSyncs.getSingleton().forMessage(message);
      if (readSync) {
        if (
          message.get('expireTimer') &&
          !message.get('expirationStartTimestamp')
        ) {
          message.set(
            'expirationStartTimestamp',
            Math.min(readSync.get('readAt'), Date.now())
          );
        }

        message.unset('unread');
        // This is primarily to allow the conversation to mark all older
        // messages as read, as is done when we receive a read sync for
        // a message we already know about.
        const c = message.getConversation();
        if (c) {
          c.onReadMessage(message);
        }
        changed = true;
      } else if (isFirstRun) {
        conversation.set({
          unreadCount: (conversation.get('unreadCount') || 0) + 1,
          isArchived: false,
        });
      }
    }

    if (type === 'outgoing') {
      const reads = ReadReceipts.getSingleton().forMessage(
        conversation,
        message
      );
      if (reads.length) {
        const readBy = reads.map(receipt => receipt.get('reader'));
        message.set({
          read_by: _.union(message.get('read_by'), readBy),
        });
        changed = true;
      }

      // A sync'd message to ourself is automatically considered read/delivered
      if (isFirstRun && isMe(conversation.attributes)) {
        message.set({
          read_by: conversation.getRecipients(),
          delivered_to: conversation.getRecipients(),
        });
        changed = true;
      }

      if (isFirstRun) {
        message.set({ recipients: conversation.getRecipients() });
        changed = true;
      }
    }

    // Check for out-of-order view syncs
    if (type === 'incoming' && isTapToView(message.attributes)) {
      const viewSync = ViewSyncs.getSingleton().forMessage(message);
      if (viewSync) {
        await message.markViewed({ fromSync: true });
        changed = true;
      }
    }

    // Does this message have any pending, previously-received associated reactions?
    const reactions = Reactions.getSingleton().forMessage(message);
    await Promise.all(
      reactions.map(async reaction => {
        await message.handleReaction(reaction, false);
        changed = true;
      })
    );

    // Does this message have any pending, previously-received associated
    // delete for everyone messages?
    const deletes = Deletes.getSingleton().forMessage(message);
    await Promise.all(
      deletes.map(async del => {
        await window.Signal.Util.deleteForEveryone(message, del, false);
        changed = true;
      })
    );

    if (changed && !isFirstRun) {
      window.log.info(
        `modifyTargetMessage/${this.idForLogging()}: Changes in second run; saving.`
      );
      await window.Signal.Data.saveMessage(this.attributes, {
        Message: window.Whisper.Message,
      });
    }
  }

  async handleReaction(
    reaction: typeof window.WhatIsThis,
    shouldPersist = true
  ): Promise<ReactionAttributesType | undefined> {
    const { attributes } = this;

    if (this.get('deletedForEveryone')) {
      return undefined;
    }

    // We allow you to react to messages with outgoing errors only if it has sent
    //   successfully to at least one person.
    if (
      hasErrors(attributes) &&
      (isIncoming(attributes) ||
        getMessagePropStatus(
          attributes,
          window.storage.get('read-receipt-setting', false)
        ) !== 'partial-sent')
    ) {
      return undefined;
    }

    const reactions = this.get('reactions') || [];
    const messageId = this.idForLogging();
    const count = reactions.length;

    const conversation = window.ConversationController.get(
      this.get('conversationId')
    );

    let reactionToRemove: Partial<ReactionType> | undefined;

    let oldReaction: ReactionAttributesType | undefined;
    if (reaction.get('remove')) {
      window.log.info('Removing reaction for message', messageId);
      const newReactions = reactions.filter(
        re =>
          re.emoji !== reaction.get('emoji') ||
          re.fromId !== reaction.get('fromId')
      );
      this.set({ reactions: newReactions });

      reactionToRemove = {
        emoji: reaction.get('emoji'),
        targetAuthorUuid: reaction.get('targetAuthorUuid'),
        targetTimestamp: reaction.get('targetTimestamp'),
      };

      await window.Signal.Data.removeReactionFromConversation({
        emoji: reaction.get('emoji'),
        fromId: reaction.get('fromId'),
        targetAuthorUuid: reaction.get('targetAuthorUuid'),
        targetTimestamp: reaction.get('targetTimestamp'),
      });
    } else {
      window.log.info('Adding reaction for message', messageId);
      const newReactions = reactions.filter(
        re => re.fromId !== reaction.get('fromId')
      );
      newReactions.push(reaction.toJSON());
      this.set({ reactions: newReactions });

      oldReaction = reactions.find(re => re.fromId === reaction.get('fromId'));
      if (oldReaction) {
        reactionToRemove = {
          emoji: oldReaction.emoji,
          targetAuthorUuid: oldReaction.targetAuthorUuid,
          targetTimestamp: oldReaction.targetTimestamp,
        };
      }

      await window.Signal.Data.addReaction({
        conversationId: this.get('conversationId'),
        emoji: reaction.get('emoji'),
        fromId: reaction.get('fromId'),
        messageReceivedAt: this.get('received_at'),
        targetAuthorUuid: reaction.get('targetAuthorUuid'),
        targetTimestamp: reaction.get('targetTimestamp'),
      });

      // Only notify for reactions to our own messages
      if (
        conversation &&
        isOutgoing(this.attributes) &&
        !reaction.get('fromSync')
      ) {
        conversation.notify(this, reaction);
      }
    }

    if (reactionToRemove) {
      this.clearNotifications(reactionToRemove);
    }

    const newCount = (this.get('reactions') || []).length;
    window.log.info(
      `Done processing reaction for message ${messageId}. Went from ${count} to ${newCount} reactions.`
    );

    if (shouldPersist) {
      await window.Signal.Data.saveMessage(this.attributes, {
        Message: window.Whisper.Message,
      });
    }

    return oldReaction;
  }

  async handleDeleteForEveryone(
    del: typeof window.WhatIsThis,
    shouldPersist = true
  ): Promise<void> {
    window.log.info('Handling DOE.', {
      fromId: del.get('fromId'),
      targetSentTimestamp: del.get('targetSentTimestamp'),
      messageServerTimestamp: this.get('serverTimestamp'),
      deleteServerTimestamp: del.get('serverTimestamp'),
    });

    // Remove any notifications for this message
    window.Whisper.Notifications.removeBy({ messageId: this.get('id') });

    // Erase the contents of this message
    await this.eraseContents(
      { deletedForEveryone: true, reactions: [] },
      shouldPersist
    );

    // Update the conversation's last message in case this was the last message
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.getConversation()!.updateLastMessage();
  }

  clearNotifications(reaction: Partial<ReactionType> = {}): void {
    window.Whisper.Notifications.removeBy({
      ...reaction,
      messageId: this.id,
    });
  }
}

export async function getMessageById(
  messageId: string
): Promise<MessageModel | undefined> {
  let message = window.MessageController.getById(messageId);
  if (message) {
    return message;
  }

  try {
    message = await window.Signal.Data.getMessageById(messageId, {
      Message: window.Whisper.Message,
    });
  } catch (error) {
    window.log.error(
      `failed to load message with id ${messageId} ` +
        `due to error ${error && error.stack}`
    );
  }

  if (!message) {
    return undefined;
  }

  message = window.MessageController.register(message.id, message);
  return message;
}

window.Whisper.Message = MessageModel;

window.Whisper.Message.getLongMessageAttachment = ({
  body,
  attachments,
  now,
}) => {
  if (!body || body.length <= 2048) {
    return {
      body,
      attachments,
    };
  }

  const data = bytesFromString(body);
  const attachment = {
    contentType: MIME.LONG_MESSAGE,
    fileName: `long-message-${now}.txt`,
    data,
    size: data.byteLength,
  };

  return {
    body: body.slice(0, 2048),
    attachments: [attachment, ...attachments],
  };
};

window.Whisper.Message.updateTimers = () => {
  window.Whisper.ExpiringMessagesListener.update();
  window.Whisper.TapToViewMessagesListener.update();
};

window.Whisper.MessageCollection = window.Backbone.Collection.extend({
  model: window.Whisper.Message,
  comparator(left: Readonly<MessageModel>, right: Readonly<MessageModel>) {
    if (left.get('received_at') === right.get('received_at')) {
      return (left.get('sent_at') || 0) - (right.get('sent_at') || 0);
    }

    return (left.get('received_at') || 0) - (right.get('received_at') || 0);
  },
});
