// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable no-nested-ternary */
/* eslint-disable class-methods-use-this */
/* eslint-disable more/no-then */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-classes-per-file */

import { Dictionary } from 'lodash';
import PQueue from 'p-queue';
import {
  PlaintextContent,
  ProtocolAddress,
  SenderKeyDistributionMessage,
} from '@signalapp/signal-client';

import { assert } from '../util/assert';
import { parseIntOrThrow } from '../util/parseIntOrThrow';
import { SenderKeys } from '../LibSignalStores';
import {
  GroupCredentialsType,
  GroupLogResponseType,
  ProxiedRequestOptionsType,
  ChallengeType,
  WebAPIType,
  MultiRecipient200ResponseType,
} from './WebAPI';
import createTaskWithTimeout from './TaskWithTimeout';
import OutgoingMessage, { SerializedCertificateType } from './OutgoingMessage';
import Crypto from './Crypto';
import {
  base64ToArrayBuffer,
  concatenateBytes,
  getRandomBytes,
  getZeroes,
  hexToArrayBuffer,
  typedArrayToArrayBuffer,
} from '../Crypto';
import {
  AttachmentPointerClass,
  CallingMessageClass,
  ContentClass,
  DataMessageClass,
  StorageServiceCallOptionsType,
  StorageServiceCredentials,
  SyncMessageClass,
} from '../textsecure.d';
import { MessageError, SignedPreKeyRotationError } from './Errors';
import { BodyRangesType } from '../types/Util';
import {
  LinkPreviewImage,
  LinkPreviewMetadata,
} from '../linkPreviews/linkPreviewFetch';
import { concat } from '../util/iterables';
import { SignalService as Proto } from '../protobuf';

function stringToArrayBuffer(str: string): ArrayBuffer {
  if (typeof str !== 'string') {
    throw new Error('Passed non-string to stringToArrayBuffer');
  }
  const res = new ArrayBuffer(str.length);
  const uint = new Uint8Array(res);
  for (let i = 0; i < str.length; i += 1) {
    uint[i] = str.charCodeAt(i);
  }
  return res;
}

export type SendMetadataType = {
  [identifier: string]: {
    accessKey: string;
    senderCertificate?: SerializedCertificateType;
  };
};

export type SendOptionsType = {
  sendMetadata?: SendMetadataType;
  online?: boolean;
};

export type CustomError = Error & {
  identifier?: string;
  number?: string;
};

export type CallbackResultType = {
  successfulIdentifiers?: Array<any>;
  failoverIdentifiers?: Array<any>;
  errors?: Array<CustomError>;
  unidentifiedDeliveries?: Array<any>;
  dataMessage?: ArrayBuffer;
};

type PreviewType = {
  url: string;
  title: string;
  image: AttachmentType;
};

type QuoteAttachmentType = {
  thumbnail?: AttachmentType;
  attachmentPointer?: AttachmentPointerClass;
};

export type GroupV2InfoType = {
  groupChange?: Uint8Array;
  masterKey: Uint8Array;
  revision: number;
  members: Array<string>;
};
type GroupV1InfoType = {
  id: string;
  members: Array<string>;
};

type GroupCallUpdateType = {
  eraId: string;
};

export type AttachmentType = {
  size: number;
  data: ArrayBuffer;
  contentType: string;

  fileName: string;
  flags: number;
  width: number;
  height: number;
  caption: string;

  attachmentPointer?: AttachmentPointerClass;

  blurHash?: string;
};

export type MessageOptionsType = {
  attachments?: Array<AttachmentType> | null;
  body?: string;
  expireTimer?: number;
  flags?: number;
  group?: {
    id: string;
    type: number;
  };
  groupV2?: GroupV2InfoType;
  needsSync?: boolean;
  preview?: Array<PreviewType> | null;
  profileKey?: ArrayBuffer;
  quote?: any;
  recipients: Array<string>;
  sticker?: any;
  reaction?: any;
  deletedForEveryoneTimestamp?: number;
  timestamp: number;
  mentions?: BodyRangesType;
  groupCallUpdate?: GroupCallUpdateType;
};
export type GroupSendOptionsType = {
  attachments?: Array<AttachmentType>;
  expireTimer?: number;
  groupV2?: GroupV2InfoType;
  groupV1?: GroupV1InfoType;
  messageText?: string;
  preview?: any;
  profileKey?: ArrayBuffer;
  quote?: any;
  reaction?: any;
  sticker?: any;
  deletedForEveryoneTimestamp?: number;
  timestamp: number;
  mentions?: BodyRangesType;
  groupCallUpdate?: GroupCallUpdateType;
};

class Message {
  attachments: Array<any>;

  body?: string;

  expireTimer?: number;

  flags?: number;

  group?: {
    id: string;
    type: number;
  };

  groupV2?: GroupV2InfoType;

  needsSync?: boolean;

  preview: any;

  profileKey?: ArrayBuffer;

  quote?: {
    id?: number;
    authorUuid?: string;
    text?: string;
    attachments?: Array<AttachmentType>;
    bodyRanges?: BodyRangesType;
  };

  recipients: Array<string>;

  sticker?: any;

  reaction?: {
    emoji?: string;
    remove?: boolean;
    targetAuthorUuid?: string;
    targetTimestamp?: number;
  };

  timestamp: number;

  dataMessage: any;

  attachmentPointers?: Array<any>;

  deletedForEveryoneTimestamp?: number;

  mentions?: BodyRangesType;

  groupCallUpdate?: GroupCallUpdateType;

  constructor(options: MessageOptionsType) {
    this.attachments = options.attachments || [];
    this.body = options.body;
    this.expireTimer = options.expireTimer;
    this.flags = options.flags;
    this.group = options.group;
    this.groupV2 = options.groupV2;
    this.needsSync = options.needsSync;
    this.preview = options.preview;
    this.profileKey = options.profileKey;
    this.quote = options.quote;
    this.recipients = options.recipients;
    this.sticker = options.sticker;
    this.reaction = options.reaction;
    this.timestamp = options.timestamp;
    this.deletedForEveryoneTimestamp = options.deletedForEveryoneTimestamp;
    this.mentions = options.mentions;
    this.groupCallUpdate = options.groupCallUpdate;

    if (!(this.recipients instanceof Array)) {
      throw new Error('Invalid recipient list');
    }

    if (!this.group && !this.groupV2 && this.recipients.length !== 1) {
      throw new Error('Invalid recipient list for non-group');
    }

    if (typeof this.timestamp !== 'number') {
      throw new Error('Invalid timestamp');
    }

    if (this.expireTimer !== undefined && this.expireTimer !== null) {
      if (typeof this.expireTimer !== 'number' || !(this.expireTimer >= 0)) {
        throw new Error('Invalid expireTimer');
      }
    }

    if (this.attachments) {
      if (!(this.attachments instanceof Array)) {
        throw new Error('Invalid message attachments');
      }
    }
    if (this.flags !== undefined) {
      if (typeof this.flags !== 'number') {
        throw new Error('Invalid message flags');
      }
    }
    if (this.isEndSession()) {
      if (
        this.body !== null ||
        this.group !== null ||
        this.attachments.length !== 0
      ) {
        throw new Error('Invalid end session message');
      }
    } else {
      if (
        typeof this.timestamp !== 'number' ||
        (this.body && typeof this.body !== 'string')
      ) {
        throw new Error('Invalid message body');
      }
      if (this.group) {
        if (
          typeof this.group.id !== 'string' ||
          typeof this.group.type !== 'number'
        ) {
          throw new Error('Invalid group context');
        }
      }
    }
  }

  isEndSession() {
    return (
      (this.flags || 0) &
      window.textsecure.protobuf.DataMessage.Flags.END_SESSION
    );
  }

  toProto(): DataMessageClass {
    if (this.dataMessage instanceof window.textsecure.protobuf.DataMessage) {
      return this.dataMessage;
    }
    const proto = new window.textsecure.protobuf.DataMessage();

    proto.timestamp = this.timestamp;
    proto.attachments = this.attachmentPointers;

    if (this.body) {
      proto.body = this.body;

      const mentionCount = this.mentions ? this.mentions.length : 0;
      const placeholders = this.body.match(/\uFFFC/g);
      const placeholderCount = placeholders ? placeholders.length : 0;
      window.log.info(
        `Sending a message with ${mentionCount} mentions and ${placeholderCount} placeholders`
      );
    }
    if (this.flags) {
      proto.flags = this.flags;
    }
    if (this.groupV2) {
      proto.groupV2 = new window.textsecure.protobuf.GroupContextV2();
      proto.groupV2.masterKey = this.groupV2.masterKey;
      proto.groupV2.revision = this.groupV2.revision;
      proto.groupV2.groupChange = this.groupV2.groupChange || null;
    } else if (this.group) {
      proto.group = new window.textsecure.protobuf.GroupContext();
      proto.group.id = stringToArrayBuffer(this.group.id);
      proto.group.type = this.group.type;
    }
    if (this.sticker) {
      proto.sticker = new window.textsecure.protobuf.DataMessage.Sticker();
      proto.sticker.packId = hexToArrayBuffer(this.sticker.packId);
      proto.sticker.packKey = base64ToArrayBuffer(this.sticker.packKey);
      proto.sticker.stickerId = this.sticker.stickerId;

      if (this.sticker.attachmentPointer) {
        proto.sticker.data = this.sticker.attachmentPointer;
      }
    }
    if (this.reaction) {
      proto.reaction = new window.textsecure.protobuf.DataMessage.Reaction();
      proto.reaction.emoji = this.reaction.emoji || null;
      proto.reaction.remove = this.reaction.remove || false;
      proto.reaction.targetAuthorUuid = this.reaction.targetAuthorUuid || null;
      proto.reaction.targetTimestamp = this.reaction.targetTimestamp || null;
    }

    if (Array.isArray(this.preview)) {
      proto.preview = this.preview.map(preview => {
        const item = new window.textsecure.protobuf.DataMessage.Preview();
        item.title = preview.title;
        item.url = preview.url;
        item.description = preview.description || null;
        item.date = preview.date || null;
        item.image = preview.image || null;
        return item;
      });
    }
    if (this.quote) {
      const { QuotedAttachment } = window.textsecure.protobuf.DataMessage.Quote;
      const { BodyRange, Quote } = window.textsecure.protobuf.DataMessage;

      proto.quote = new Quote();
      const { quote } = proto;

      quote.id = this.quote.id || null;
      quote.authorUuid = this.quote.authorUuid || null;
      quote.text = this.quote.text || null;
      quote.attachments = (this.quote.attachments || []).map(
        (attachment: AttachmentType) => {
          const quotedAttachment = new QuotedAttachment();

          quotedAttachment.contentType = attachment.contentType;
          quotedAttachment.fileName = attachment.fileName;
          if (attachment.attachmentPointer) {
            quotedAttachment.thumbnail = attachment.attachmentPointer;
          }

          return quotedAttachment;
        }
      );
      const bodyRanges: BodyRangesType = this.quote.bodyRanges || [];
      quote.bodyRanges = bodyRanges.map(range => {
        const bodyRange = new BodyRange();
        bodyRange.start = range.start;
        bodyRange.length = range.length;
        bodyRange.mentionUuid = range.mentionUuid;
        return bodyRange;
      });
      if (
        quote.bodyRanges.length &&
        (!proto.requiredProtocolVersion ||
          proto.requiredProtocolVersion <
            window.textsecure.protobuf.DataMessage.ProtocolVersion.MENTIONS)
      ) {
        proto.requiredProtocolVersion =
          window.textsecure.protobuf.DataMessage.ProtocolVersion.MENTIONS;
      }
    }
    if (this.expireTimer) {
      proto.expireTimer = this.expireTimer;
    }
    if (this.profileKey) {
      proto.profileKey = this.profileKey;
    }
    if (this.deletedForEveryoneTimestamp) {
      proto.delete = {
        targetSentTimestamp: this.deletedForEveryoneTimestamp,
      };
    }
    if (this.mentions) {
      proto.requiredProtocolVersion =
        window.textsecure.protobuf.DataMessage.ProtocolVersion.MENTIONS;
      proto.bodyRanges = this.mentions.map(
        ({ start, length, mentionUuid }) => ({
          start,
          length,
          mentionUuid,
        })
      );
    }

    if (this.groupCallUpdate) {
      const { GroupCallUpdate } = window.textsecure.protobuf.DataMessage;

      const groupCallUpdate = new GroupCallUpdate();
      groupCallUpdate.eraId = this.groupCallUpdate.eraId;

      proto.groupCallUpdate = groupCallUpdate;
    }

    this.dataMessage = proto;
    return proto;
  }

  toArrayBuffer() {
    return this.toProto().toArrayBuffer();
  }
}

export default class MessageSender {
  server: WebAPIType;

  pendingMessages: {
    [id: string]: PQueue;
  };

  constructor(username: string, password: string) {
    this.server = window.WebAPI.connect({ username, password });
    this.pendingMessages = {};
  }

  async queueJobForIdentifier(
    identifier: string,
    runJob: () => Promise<any>
  ): Promise<void> {
    const { id } = await window.ConversationController.getOrCreateAndWait(
      identifier,
      'private'
    );
    this.pendingMessages[id] =
      this.pendingMessages[id] || new PQueue({ concurrency: 1 });

    const queue = this.pendingMessages[id];

    const taskWithTimeout = createTaskWithTimeout(
      runJob,
      `queueJobForIdentifier ${identifier} ${id}`
    );

    return queue.add(taskWithTimeout);
  }

  // Attachment upload functions

  _getAttachmentSizeBucket(size: number): number {
    return Math.max(
      541,
      Math.floor(1.05 ** Math.ceil(Math.log(size) / Math.log(1.05)))
    );
  }

  getRandomPadding(): ArrayBuffer {
    // Generate a random int from 1 and 512
    const buffer = getRandomBytes(2);
    const paddingLength = (new Uint16Array(buffer)[0] & 0x1ff) + 1;

    // Generate a random padding buffer of the chosen size
    return getRandomBytes(paddingLength);
  }

  getPaddedAttachment(data: ArrayBuffer): ArrayBuffer {
    const size = data.byteLength;
    const paddedSize = this._getAttachmentSizeBucket(size);
    const padding = getZeroes(paddedSize - size);

    return concatenateBytes(data, padding);
  }

  async makeAttachmentPointer(
    attachment: AttachmentType
  ): Promise<AttachmentPointerClass | undefined> {
    if (typeof attachment !== 'object' || attachment == null) {
      return Promise.resolve(undefined);
    }

    const { data, size } = attachment;
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      throw new Error(
        `makeAttachmentPointer: data was a '${typeof data}' instead of ArrayBuffer/ArrayBufferView`
      );
    }
    if (data.byteLength !== size) {
      throw new Error(
        `makeAttachmentPointer: Size ${size} did not match data.byteLength ${data.byteLength}`
      );
    }

    const padded = this.getPaddedAttachment(data);
    const key = getRandomBytes(64);
    const iv = getRandomBytes(16);

    const result = await Crypto.encryptAttachment(padded, key, iv);
    const id = await this.server.putAttachment(result.ciphertext);

    const proto = new window.textsecure.protobuf.AttachmentPointer();
    proto.cdnId = id;
    proto.contentType = attachment.contentType;
    proto.key = key;
    proto.size = attachment.size;
    proto.digest = result.digest;

    if (attachment.fileName) {
      proto.fileName = attachment.fileName;
    }
    if (attachment.flags) {
      proto.flags = attachment.flags;
    }
    if (attachment.width) {
      proto.width = attachment.width;
    }
    if (attachment.height) {
      proto.height = attachment.height;
    }
    if (attachment.caption) {
      proto.caption = attachment.caption;
    }
    if (attachment.blurHash) {
      proto.blurHash = attachment.blurHash;
    }

    return proto;
  }

  async uploadAttachments(message: Message): Promise<void> {
    return Promise.all(
      message.attachments.map(this.makeAttachmentPointer.bind(this))
    )
      .then(attachmentPointers => {
        // eslint-disable-next-line no-param-reassign
        message.attachmentPointers = attachmentPointers;
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'HTTPError') {
          throw new MessageError(message, error);
        } else {
          throw error;
        }
      });
  }

  async uploadLinkPreviews(message: Message): Promise<void> {
    try {
      const preview = await Promise.all(
        (message.preview || []).map(async (item: PreviewType) => ({
          ...item,
          image: await this.makeAttachmentPointer(item.image),
        }))
      );
      // eslint-disable-next-line no-param-reassign
      message.preview = preview;
    } catch (error) {
      if (error instanceof Error && error.name === 'HTTPError') {
        throw new MessageError(message, error);
      } else {
        throw error;
      }
    }
  }

  async uploadSticker(message: Message): Promise<void> {
    try {
      const { sticker } = message;

      if (!sticker || !sticker.data) {
        return;
      }

      // eslint-disable-next-line no-param-reassign
      message.sticker = {
        ...sticker,
        attachmentPointer: await this.makeAttachmentPointer(sticker.data),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'HTTPError') {
        throw new MessageError(message, error);
      } else {
        throw error;
      }
    }
  }

  async uploadThumbnails(message: Message): Promise<void> {
    const makePointer = this.makeAttachmentPointer.bind(this);
    const { quote } = message;

    if (!quote || !quote.attachments || quote.attachments.length === 0) {
      return;
    }

    await Promise.all(
      quote.attachments.map((attachment: QuoteAttachmentType) => {
        if (!attachment.thumbnail) {
          return null;
        }

        return makePointer(attachment.thumbnail).then(pointer => {
          // eslint-disable-next-line no-param-reassign
          attachment.attachmentPointer = pointer;
        });
      })
    ).catch(error => {
      if (error instanceof Error && error.name === 'HTTPError') {
        throw new MessageError(message, error);
      } else {
        throw error;
      }
    });
  }

  // Proto assembly

  async getDataMessage(options: MessageOptionsType): Promise<ArrayBuffer> {
    const message = await this.getHydratedMessage(options);
    return message.toArrayBuffer();
  }

  async getContentMessage(options: MessageOptionsType): Promise<ContentClass> {
    const message = await this.getHydratedMessage(options);
    const dataMessage = message.toProto();

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.dataMessage = dataMessage;

    return contentMessage;
  }

  async getHydratedMessage(attributes: MessageOptionsType): Promise<Message> {
    const message = new Message(attributes);
    await Promise.all([
      this.uploadAttachments(message),
      this.uploadThumbnails(message),
      this.uploadLinkPreviews(message),
      this.uploadSticker(message),
    ]);

    return message;
  }

  getTypingContentMessage(options: {
    recipientId?: string;
    groupId?: ArrayBuffer;
    groupMembers: Array<string>;
    isTyping: boolean;
    timestamp?: number;
  }): ContentClass {
    const ACTION_ENUM = window.textsecure.protobuf.TypingMessage.Action;
    const { recipientId, groupId, isTyping, timestamp } = options;

    if (!recipientId && !groupId) {
      throw new Error(
        'getTypingContentMessage: Need to provide either recipientId or groupId!'
      );
    }

    const finalTimestamp = timestamp || Date.now();
    const action = isTyping ? ACTION_ENUM.STARTED : ACTION_ENUM.STOPPED;

    const typingMessage = new window.textsecure.protobuf.TypingMessage();
    typingMessage.groupId = groupId || null;
    typingMessage.action = action;
    typingMessage.timestamp = finalTimestamp;

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.typingMessage = typingMessage;

    return contentMessage;
  }

  getAttrsFromGroupOptions(options: GroupSendOptionsType): MessageOptionsType {
    const {
      messageText,
      timestamp,
      attachments,
      quote,
      preview,
      sticker,
      reaction,
      expireTimer,
      profileKey,
      deletedForEveryoneTimestamp,
      groupV2,
      groupV1,
      mentions,
      groupCallUpdate,
    } = options;

    if (!groupV1 && !groupV2) {
      throw new Error(
        'getAttrsFromGroupOptions: Neither group1 nor groupv2 information provided!'
      );
    }

    const myE164 = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();

    const groupMembers = groupV2?.members || groupV1?.members || [];

    // We should always have a UUID but have this check just in case we don't.
    let isNotMe: (recipient: string) => boolean;
    if (myUuid) {
      isNotMe = r => r !== myE164 && r !== myUuid;
    } else {
      isNotMe = r => r !== myE164;
    }

    const blockedIdentifiers = new Set(
      concat(
        window.storage.blocked.getBlockedUuids(),
        window.storage.blocked.getBlockedNumbers()
      )
    );

    const recipients = groupMembers.filter(
      recipient => isNotMe(recipient) && !blockedIdentifiers.has(recipient)
    );

    return {
      attachments,
      body: messageText,
      deletedForEveryoneTimestamp,
      expireTimer,
      groupCallUpdate,
      groupV2,
      group: groupV1
        ? {
            id: groupV1.id,
            type: window.textsecure.protobuf.GroupContext.Type.DELIVER,
          }
        : undefined,
      mentions,
      preview,
      profileKey,
      quote,
      reaction,
      recipients,
      sticker,
      timestamp,
    };
  }

  createSyncMessage(): SyncMessageClass {
    const syncMessage = new window.textsecure.protobuf.SyncMessage();

    syncMessage.padding = this.getRandomPadding();

    return syncMessage;
  }

  // Low-level sends

  async sendMessage(
    attrs: MessageOptionsType,
    contentHint: number,
    groupId: string | undefined,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const message = new Message(attrs);

    return Promise.all([
      this.uploadAttachments(message),
      this.uploadThumbnails(message),
      this.uploadLinkPreviews(message),
      this.uploadSticker(message),
    ]).then(
      async (): Promise<CallbackResultType> =>
        new Promise((resolve, reject) => {
          this.sendMessageProto(
            message.timestamp,
            message.recipients || [],
            message.toProto(),
            contentHint,
            groupId,
            (res: CallbackResultType) => {
              res.dataMessage = message.toArrayBuffer();
              if (res.errors && res.errors.length > 0) {
                reject(res);
              } else {
                resolve(res);
              }
            },
            options
          );
        })
    );
  }

  sendMessageProto(
    timestamp: number,
    recipients: Array<string>,
    messageProto: ContentClass | DataMessageClass | PlaintextContent,
    contentHint: number,
    groupId: string | undefined,
    callback: (result: CallbackResultType) => void,
    options?: SendOptionsType
  ): void {
    const rejections = window.textsecure.storage.get(
      'signedKeyRotationRejected',
      0
    );
    if (rejections > 5) {
      throw new SignedPreKeyRotationError();
    }

    const outgoing = new OutgoingMessage(
      this.server,
      timestamp,
      recipients,
      messageProto,
      contentHint,
      groupId,
      callback,
      options
    );

    recipients.forEach(identifier => {
      this.queueJobForIdentifier(identifier, async () =>
        outgoing.sendToIdentifier(identifier)
      );
    });
  }

  async sendMessageProtoAndWait(
    timestamp: number,
    identifiers: Array<string>,
    messageProto: ContentClass | DataMessageClass | PlaintextContent,
    contentHint: number,
    groupId: string | undefined,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    return new Promise((resolve, reject) => {
      const callback = (result: CallbackResultType) => {
        if (result && result.errors && result.errors.length > 0) {
          reject(result);
          return;
        }

        resolve(result);
      };

      this.sendMessageProto(
        timestamp,
        identifiers,
        messageProto,
        contentHint,
        groupId,
        callback,
        options
      );
    });
  }

  async sendIndividualProto(
    identifier: string | undefined,
    proto: DataMessageClass | ContentClass | PlaintextContent,
    timestamp: number,
    contentHint: number,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    assert(identifier, "Identifier can't be undefined");
    return new Promise((resolve, reject) => {
      const callback = (res: CallbackResultType) => {
        if (res && res.errors && res.errors.length > 0) {
          reject(res);
        } else {
          resolve(res);
        }
      };
      this.sendMessageProto(
        timestamp,
        [identifier],
        proto,
        contentHint,
        undefined, // groupId
        callback,
        options
      );
    });
  }

  // You might wonder why this takes a groupId. models/messages.resend() can send a group
  //   message to just one person.
  async sendMessageToIdentifier(
    identifier: string,
    messageText: string | undefined,
    attachments: Array<AttachmentType> | undefined,
    quote: unknown,
    preview: Array<PreviewType> | undefined,
    sticker: unknown,
    reaction: unknown,
    deletedForEveryoneTimestamp: number | undefined,
    timestamp: number,
    expireTimer: number | undefined,
    contentHint: number,
    groupId: string | undefined,
    profileKey?: ArrayBuffer,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    return this.sendMessage(
      {
        recipients: [identifier],
        body: messageText,
        timestamp,
        attachments,
        quote,
        preview,
        sticker,
        reaction,
        deletedForEveryoneTimestamp,
        expireTimer,
        profileKey,
      },
      contentHint,
      groupId,
      options
    );
  }

  // Support for sync messages

  async sendSyncMessage(
    encodedDataMessage: ArrayBuffer,
    timestamp: number,
    destination: string | undefined,
    destinationUuid: string | null | undefined,
    expirationStartTimestamp: number | null,
    sentTo: Array<string> = [],
    unidentifiedDeliveries: Array<string> = [],
    isUpdate = false,
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();

    if (myDevice === 1) {
      return Promise.resolve();
    }

    const dataMessage = window.textsecure.protobuf.DataMessage.decode(
      encodedDataMessage
    );
    const sentMessage = new window.textsecure.protobuf.SyncMessage.Sent();
    sentMessage.timestamp = timestamp;
    sentMessage.message = dataMessage;
    if (destination) {
      sentMessage.destination = destination;
    }
    if (destinationUuid) {
      sentMessage.destinationUuid = destinationUuid;
    }
    if (expirationStartTimestamp) {
      sentMessage.expirationStartTimestamp = expirationStartTimestamp;
    }

    const unidentifiedLookup = unidentifiedDeliveries.reduce(
      (accumulator, item) => {
        // eslint-disable-next-line no-param-reassign
        accumulator[item] = true;
        return accumulator;
      },
      Object.create(null)
    );

    if (isUpdate) {
      sentMessage.isRecipientUpdate = true;
    }

    // Though this field has 'unidenified' in the name, it should have entries for each
    //   number we sent to.
    if (sentTo && sentTo.length) {
      sentMessage.unidentifiedStatus = sentTo.map(identifier => {
        const status = new window.textsecure.protobuf.SyncMessage.Sent.UnidentifiedDeliveryStatus();
        const conv = window.ConversationController.get(identifier);
        if (conv && conv.get('e164')) {
          status.destination = conv.get('e164');
        }
        if (conv && conv.get('uuid')) {
          status.destinationUuid = conv.get('uuid');
        }
        status.unidentified = Boolean(unidentifiedLookup[identifier]);
        return status;
      });
    }

    const syncMessage = this.createSyncMessage();
    syncMessage.sent = sentMessage;
    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.syncMessage = syncMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendIndividualProto(
      myUuid || myNumber,
      contentMessage,
      timestamp,
      ContentHint.IMPLICIT,
      options
    );
  }

  async sendRequestBlockSyncMessage(
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice !== 1) {
      const request = new window.textsecure.protobuf.SyncMessage.Request();
      request.type =
        window.textsecure.protobuf.SyncMessage.Request.Type.BLOCKED;
      const syncMessage = this.createSyncMessage();
      syncMessage.request = request;
      const contentMessage = new window.textsecure.protobuf.Content();
      contentMessage.syncMessage = syncMessage;

      const {
        ContentHint,
      } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

      return this.sendIndividualProto(
        myUuid || myNumber,
        contentMessage,
        Date.now(),
        ContentHint.IMPLICIT,
        options
      );
    }

    return Promise.resolve();
  }

  async sendRequestConfigurationSyncMessage(
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice !== 1) {
      const request = new window.textsecure.protobuf.SyncMessage.Request();
      request.type =
        window.textsecure.protobuf.SyncMessage.Request.Type.CONFIGURATION;
      const syncMessage = this.createSyncMessage();
      syncMessage.request = request;
      const contentMessage = new window.textsecure.protobuf.Content();
      contentMessage.syncMessage = syncMessage;

      const {
        ContentHint,
      } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

      return this.sendIndividualProto(
        myUuid || myNumber,
        contentMessage,
        Date.now(),
        ContentHint.IMPLICIT,
        options
      );
    }

    return Promise.resolve();
  }

  async sendRequestGroupSyncMessage(
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice !== 1) {
      const request = new window.textsecure.protobuf.SyncMessage.Request();
      request.type = window.textsecure.protobuf.SyncMessage.Request.Type.GROUPS;
      const syncMessage = this.createSyncMessage();
      syncMessage.request = request;
      const contentMessage = new window.textsecure.protobuf.Content();
      contentMessage.syncMessage = syncMessage;

      const {
        ContentHint,
      } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

      return this.sendIndividualProto(
        myUuid || myNumber,
        contentMessage,
        Date.now(),
        ContentHint.IMPLICIT,
        options
      );
    }

    return Promise.resolve();
  }

  async sendRequestContactSyncMessage(
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();

    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice !== 1) {
      const request = new window.textsecure.protobuf.SyncMessage.Request();
      request.type =
        window.textsecure.protobuf.SyncMessage.Request.Type.CONTACTS;
      const syncMessage = this.createSyncMessage();
      syncMessage.request = request;
      const contentMessage = new window.textsecure.protobuf.Content();
      contentMessage.syncMessage = syncMessage;

      const {
        ContentHint,
      } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

      return this.sendIndividualProto(
        myUuid || myNumber,
        contentMessage,
        Date.now(),
        ContentHint.IMPLICIT,
        options
      );
    }

    return Promise.resolve();
  }

  async sendFetchManifestSyncMessage(
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myUuid = window.textsecure.storage.user.getUuid();
    const myNumber = window.textsecure.storage.user.getNumber();
    const myDevice = window.textsecure.storage.user.getDeviceId();

    if (myDevice === 1) {
      return;
    }

    const fetchLatest = new window.textsecure.protobuf.SyncMessage.FetchLatest();
    fetchLatest.type =
      window.textsecure.protobuf.SyncMessage.FetchLatest.Type.STORAGE_MANIFEST;

    const syncMessage = this.createSyncMessage();
    syncMessage.fetchLatest = fetchLatest;
    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.syncMessage = syncMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    await this.sendIndividualProto(
      myUuid || myNumber,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      options
    );
  }

  async sendRequestKeySyncMessage(
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myUuid = window.textsecure.storage.user.getUuid();
    const myNumber = window.textsecure.storage.user.getNumber();
    const myDevice = window.textsecure.storage.user.getDeviceId();

    if (myDevice === 1) {
      return;
    }

    const request = new window.textsecure.protobuf.SyncMessage.Request();
    request.type = window.textsecure.protobuf.SyncMessage.Request.Type.KEYS;

    const syncMessage = this.createSyncMessage();
    syncMessage.request = request;
    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.syncMessage = syncMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    await this.sendIndividualProto(
      myUuid || myNumber,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      options
    );
  }

  async syncReadMessages(
    reads: Array<{
      senderUuid?: string;
      senderE164?: string;
      timestamp: number;
    }>,
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice !== 1) {
      const syncMessage = this.createSyncMessage();
      syncMessage.read = [];
      for (let i = 0; i < reads.length; i += 1) {
        const read = new window.textsecure.protobuf.SyncMessage.Read();
        read.timestamp = reads[i].timestamp;
        read.sender = reads[i].senderE164 || null;
        read.senderUuid = reads[i].senderUuid || null;

        syncMessage.read.push(read);
      }
      const contentMessage = new window.textsecure.protobuf.Content();
      contentMessage.syncMessage = syncMessage;

      const {
        ContentHint,
      } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

      return this.sendIndividualProto(
        myUuid || myNumber,
        contentMessage,
        Date.now(),
        ContentHint.DEFAULT,
        options
      );
    }

    return Promise.resolve();
  }

  async syncViewOnceOpen(
    sender: string | undefined,
    senderUuid: string,
    timestamp: number,
    options?: SendOptionsType
  ): Promise<CallbackResultType | null> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice === 1) {
      return null;
    }

    const syncMessage = this.createSyncMessage();

    const viewOnceOpen = new window.textsecure.protobuf.SyncMessage.ViewOnceOpen();
    viewOnceOpen.sender = sender || null;
    viewOnceOpen.senderUuid = senderUuid || null;
    viewOnceOpen.timestamp = timestamp || null;
    syncMessage.viewOnceOpen = viewOnceOpen;

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.syncMessage = syncMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendIndividualProto(
      myUuid || myNumber,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      options
    );
  }

  async syncMessageRequestResponse(
    responseArgs: {
      threadE164?: string;
      threadUuid?: string;
      groupId?: ArrayBuffer;
      type: number;
    },
    sendOptions?: SendOptionsType
  ): Promise<CallbackResultType | null> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice === 1) {
      return null;
    }

    const syncMessage = this.createSyncMessage();

    const response = new window.textsecure.protobuf.SyncMessage.MessageRequestResponse();
    response.threadE164 = responseArgs.threadE164 || null;
    response.threadUuid = responseArgs.threadUuid || null;
    response.groupId = responseArgs.groupId || null;
    response.type = responseArgs.type;
    syncMessage.messageRequestResponse = response;

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.syncMessage = syncMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendIndividualProto(
      myUuid || myNumber,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      sendOptions
    );
  }

  async sendStickerPackSync(
    operations: Array<{
      packId: string;
      packKey: string;
      installed: boolean;
    }>,
    options?: SendOptionsType
  ): Promise<CallbackResultType | null> {
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (myDevice === 1) {
      return null;
    }

    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const ENUM =
      window.textsecure.protobuf.SyncMessage.StickerPackOperation.Type;

    const packOperations = operations.map(item => {
      const { packId, packKey, installed } = item;

      const operation = new window.textsecure.protobuf.SyncMessage.StickerPackOperation();
      operation.packId = hexToArrayBuffer(packId);
      operation.packKey = base64ToArrayBuffer(packKey);
      operation.type = installed ? ENUM.INSTALL : ENUM.REMOVE;

      return operation;
    });

    const syncMessage = this.createSyncMessage();
    syncMessage.stickerPackOperation = packOperations;

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.syncMessage = syncMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendIndividualProto(
      myUuid || myNumber,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      options
    );
  }

  async syncVerification(
    destinationE164: string,
    destinationUuid: string,
    state: number,
    identityKey: ArrayBuffer,
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    const now = Date.now();

    if (myDevice === 1) {
      return Promise.resolve();
    }

    // Get padding which we can share between null message and verified sync
    const padding = this.getRandomPadding();

    // First send a null message to mask the sync message.
    const promise = this.sendNullMessage(
      { uuid: destinationUuid, e164: destinationE164, padding },
      options
    );

    return promise.then(async () => {
      const verified = new window.textsecure.protobuf.Verified();
      verified.state = state;
      if (destinationE164) {
        verified.destination = destinationE164;
      }
      if (destinationUuid) {
        verified.destinationUuid = destinationUuid;
      }
      verified.identityKey = identityKey;
      verified.nullMessage = padding;

      const syncMessage = this.createSyncMessage();
      syncMessage.verified = verified;

      const secondMessage = new window.textsecure.protobuf.Content();
      secondMessage.syncMessage = syncMessage;

      const {
        ContentHint,
      } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

      return this.sendIndividualProto(
        myUuid || myNumber,
        secondMessage,
        now,
        ContentHint.IMPLICIT,
        options
      );
    });
  }

  // Sending messages to contacts

  async sendProfileKeyUpdate(
    profileKey: ArrayBuffer,
    recipients: Array<string>,
    sendOptions: SendOptionsType,
    groupId?: string
  ): Promise<CallbackResultType> {
    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendMessage(
      {
        recipients,
        timestamp: Date.now(),
        profileKey,
        flags: window.textsecure.protobuf.DataMessage.Flags.PROFILE_KEY_UPDATE,
        ...(groupId
          ? {
              group: {
                id: groupId,
                type: window.textsecure.protobuf.GroupContext.Type.DELIVER,
              },
            }
          : {}),
      },
      ContentHint.IMPLICIT,
      undefined, // groupId
      sendOptions
    );
  }

  async sendCallingMessage(
    recipientId: string,
    callingMessage: CallingMessageClass,
    sendOptions?: SendOptionsType
  ): Promise<void> {
    const recipients = [recipientId];
    const finalTimestamp = Date.now();

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.callingMessage = callingMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    await this.sendMessageProtoAndWait(
      finalTimestamp,
      recipients,
      contentMessage,
      ContentHint.DEFAULT,
      undefined, // groupId
      sendOptions
    );
  }

  async sendDeliveryReceipt(
    recipientE164: string,
    recipientUuid: string,
    timestamps: Array<number>,
    options?: SendOptionsType
  ): Promise<CallbackResultType | void> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const myDevice = window.textsecure.storage.user.getDeviceId();
    if (
      (myNumber === recipientE164 || myUuid === recipientUuid) &&
      myDevice === 1
    ) {
      return Promise.resolve();
    }

    const receiptMessage = new window.textsecure.protobuf.ReceiptMessage();
    receiptMessage.type =
      window.textsecure.protobuf.ReceiptMessage.Type.DELIVERY;
    receiptMessage.timestamp = timestamps;

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.receiptMessage = receiptMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendIndividualProto(
      recipientUuid || recipientE164,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      options
    );
  }

  async sendReadReceipts(
    senderE164: string,
    senderUuid: string,
    timestamps: Array<number>,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const receiptMessage = new window.textsecure.protobuf.ReceiptMessage();
    receiptMessage.type = window.textsecure.protobuf.ReceiptMessage.Type.READ;
    receiptMessage.timestamp = timestamps;

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.receiptMessage = receiptMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendIndividualProto(
      senderUuid || senderE164,
      contentMessage,
      Date.now(),
      ContentHint.IMPLICIT,
      options
    );
  }

  async sendNullMessage(
    {
      uuid,
      e164,
      padding,
    }: { uuid?: string; e164?: string; padding?: ArrayBuffer },
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const nullMessage = new window.textsecure.protobuf.NullMessage();

    const identifier = uuid || e164;
    if (!identifier) {
      throw new Error('sendNullMessage: Got neither uuid nor e164!');
    }

    nullMessage.padding = padding || this.getRandomPadding();

    const contentMessage = new window.textsecure.protobuf.Content();
    contentMessage.nullMessage = nullMessage;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    // We want the NullMessage to look like a normal outgoing message
    const timestamp = Date.now();
    return this.sendIndividualProto(
      identifier,
      contentMessage,
      timestamp,
      ContentHint.IMPLICIT,
      options
    );
  }

  async resetSession(
    uuid: string,
    e164: string,
    timestamp: number,
    options?: SendOptionsType
  ): Promise<
    CallbackResultType | void | Array<CallbackResultType | void | Array<void>>
  > {
    window.log.info('resetSession: start');
    const proto = new window.textsecure.protobuf.DataMessage();
    proto.body = 'TERMINATE';
    proto.flags = window.textsecure.protobuf.DataMessage.Flags.END_SESSION;
    proto.timestamp = timestamp;

    const identifier = uuid || e164;

    const logError = (prefix: string) => (error: Error) => {
      window.log.error(prefix, error && error.stack ? error.stack : error);
      throw error;
    };

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    const sendToContactPromise = window.textsecure.storage.protocol
      .archiveAllSessions(identifier)
      .catch(logError('resetSession/archiveAllSessions1 error:'))
      .then(async () => {
        window.log.info(
          'resetSession: finished closing local sessions, now sending to contact'
        );
        return this.sendIndividualProto(
          identifier,
          proto,
          timestamp,
          ContentHint.DEFAULT,
          options
        ).catch(logError('resetSession/sendToContact error:'));
      })
      .then(async () =>
        window.textsecure.storage.protocol
          .archiveAllSessions(identifier)
          .catch(logError('resetSession/archiveAllSessions2 error:'))
      );

    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    // We already sent the reset session to our other devices in the code above!
    if ((e164 && e164 === myNumber) || (uuid && uuid === myUuid)) {
      return sendToContactPromise;
    }

    const buffer = proto.toArrayBuffer();
    const sendSyncPromise = this.sendSyncMessage(
      buffer,
      timestamp,
      e164,
      uuid,
      null,
      [],
      [],
      false,
      options
    ).catch(logError('resetSession/sendSync error:'));

    return Promise.all([sendToContactPromise, sendSyncPromise]);
  }

  async sendExpirationTimerUpdateToIdentifier(
    identifier: string,
    expireTimer: number | undefined,
    timestamp: number,
    profileKey?: ArrayBuffer,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendMessage(
      {
        recipients: [identifier],
        timestamp,
        expireTimer,
        profileKey,
        flags:
          window.textsecure.protobuf.DataMessage.Flags.EXPIRATION_TIMER_UPDATE,
      },
      ContentHint.DEFAULT,
      undefined, // groupId
      options
    );
  }

  async sendRetryRequest({
    options,
    plaintext,
    uuid,
  }: {
    options?: SendOptionsType;
    plaintext: PlaintextContent;
    uuid: string;
  }): Promise<CallbackResultType> {
    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;

    return this.sendMessageProtoAndWait(
      Date.now(),
      [uuid],
      plaintext,
      ContentHint.IMPLICIT,
      undefined, // groupId
      options
    );
  }

  // Group sends

  // No functions should really call this; since most group sends are now via Sender Key
  async sendGroupProto(
    providedIdentifiers: Array<string>,
    proto: ContentClass,
    timestamp = Date.now(),
    contentHint: number,
    groupId: string | undefined,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const dataMessage = proto.dataMessage?.toArrayBuffer();

    const myE164 = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const identifiers = providedIdentifiers.filter(
      id => id !== myE164 && id !== myUuid
    );

    if (identifiers.length === 0) {
      return Promise.resolve({
        dataMessage,
        errors: [],
        failoverIdentifiers: [],
        successfulIdentifiers: [],
        unidentifiedDeliveries: [],
      });
    }

    return new Promise((resolve, reject) => {
      const callback = (res: CallbackResultType) => {
        res.dataMessage = dataMessage;
        if (res.errors && res.errors.length > 0) {
          reject(res);
        } else {
          resolve(res);
        }
      };

      this.sendMessageProto(
        timestamp,
        providedIdentifiers,
        proto,
        contentHint,
        groupId,
        callback,
        options
      );
    });
  }

  async getSenderKeyDistributionMessage(
    distributionId: string
  ): Promise<SenderKeyDistributionMessage> {
    const ourUuid = window.textsecure.storage.user.getUuid();
    if (!ourUuid) {
      throw new Error(
        'sendSenderKeyDistributionMessage: Failed to fetch our UUID!'
      );
    }
    const ourDeviceId = parseIntOrThrow(
      window.textsecure.storage.user.getDeviceId(),
      'sendSenderKeyDistributionMessage'
    );

    const protocolAddress = ProtocolAddress.new(ourUuid, ourDeviceId);
    const address = `${ourUuid}.${ourDeviceId}`;
    const senderKeyStore = new SenderKeys();

    return window.textsecure.storage.protocol.enqueueSenderKeyJob(
      address,
      async () =>
        SenderKeyDistributionMessage.create(
          protocolAddress,
          distributionId,
          senderKeyStore
        )
    );
  }

  // The one group send exception - a message that should never be sent via sender key
  async sendSenderKeyDistributionMessage(
    {
      contentHint,
      distributionId,
      groupId,
      identifiers,
    }: {
      contentHint: number;
      distributionId: string;
      groupId: string | undefined;
      identifiers: Array<string>;
    },
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const contentMessage = new window.textsecure.protobuf.Content();

    const senderKeyDistributionMessage = await this.getSenderKeyDistributionMessage(
      distributionId
    );
    contentMessage.senderKeyDistributionMessage = window.dcodeIO.ByteBuffer.wrap(
      typedArrayToArrayBuffer(senderKeyDistributionMessage.serialize())
    );

    return this.sendGroupProto(
      identifiers,
      contentMessage,
      Date.now(),
      contentHint,
      groupId,
      options
    );
  }

  // GroupV1-only functions; not to be used in the future

  async leaveGroup(
    groupId: string,
    groupIdentifiers: Array<string>,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const proto = new window.textsecure.protobuf.DataMessage();
    proto.group = new window.textsecure.protobuf.GroupContext();
    proto.group.id = stringToArrayBuffer(groupId);
    proto.group.type = window.textsecure.protobuf.GroupContext.Type.QUIT;

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;
    return this.sendGroupProto(
      groupIdentifiers,
      proto,
      Date.now(),
      ContentHint.DEFAULT,
      undefined, // only for GV2 ids
      options
    );
  }

  async sendExpirationTimerUpdateToGroup(
    groupId: string,
    groupIdentifiers: Array<string>,
    expireTimer: number | undefined,
    timestamp: number,
    profileKey?: ArrayBuffer,
    options?: SendOptionsType
  ): Promise<CallbackResultType> {
    const myNumber = window.textsecure.storage.user.getNumber();
    const myUuid = window.textsecure.storage.user.getUuid();
    const recipients = groupIdentifiers.filter(
      identifier => identifier !== myNumber && identifier !== myUuid
    );
    const attrs = {
      recipients,
      timestamp,
      expireTimer,
      profileKey,
      flags:
        window.textsecure.protobuf.DataMessage.Flags.EXPIRATION_TIMER_UPDATE,
      group: {
        id: groupId,
        type: window.textsecure.protobuf.GroupContext.Type.DELIVER,
      },
    };

    if (recipients.length === 0) {
      return Promise.resolve({
        successfulIdentifiers: [],
        failoverIdentifiers: [],
        errors: [],
        unidentifiedDeliveries: [],
        dataMessage: await this.getDataMessage(attrs),
      });
    }

    const {
      ContentHint,
    } = window.textsecure.protobuf.UnidentifiedSenderMessage.Message;
    return this.sendMessage(
      attrs,
      ContentHint.DEFAULT,
      undefined, // only for GV2 ids
      options
    );
  }

  // Simple pass-throughs

  async getProfile(
    number: string,
    options: {
      accessKey?: string;
      profileKeyVersion?: string;
      profileKeyCredentialRequest?: string;
    } = {}
  ): Promise<any> {
    const { accessKey } = options;

    if (accessKey) {
      const unauthOptions = {
        ...options,
        accessKey,
      };
      return this.server.getProfileUnauth(number, unauthOptions);
    }

    return this.server.getProfile(number, options);
  }

  async getUuidsForE164s(
    numbers: Array<string>
  ): Promise<Dictionary<string | null>> {
    return this.server.getUuidsForE164s(numbers);
  }

  async getAvatar(path: string): Promise<any> {
    return this.server.getAvatar(path);
  }

  async getSticker(packId: string, stickerId: number): Promise<any> {
    return this.server.getSticker(packId, stickerId);
  }

  async getStickerPackManifest(packId: string): Promise<any> {
    return this.server.getStickerPackManifest(packId);
  }

  async createGroup(
    group: Proto.IGroup,
    options: GroupCredentialsType
  ): Promise<void> {
    return this.server.createGroup(group, options);
  }

  async uploadGroupAvatar(
    avatar: Uint8Array,
    options: GroupCredentialsType
  ): Promise<string> {
    return this.server.uploadGroupAvatar(avatar, options);
  }

  async getGroup(options: GroupCredentialsType): Promise<Proto.Group> {
    return this.server.getGroup(options);
  }

  async getGroupFromLink(
    groupInviteLink: string,
    auth: GroupCredentialsType
  ): Promise<Proto.GroupJoinInfo> {
    return this.server.getGroupFromLink(groupInviteLink, auth);
  }

  async getGroupLog(
    startVersion: number,
    options: GroupCredentialsType
  ): Promise<GroupLogResponseType> {
    return this.server.getGroupLog(startVersion, options);
  }

  async getGroupAvatar(key: string): Promise<ArrayBuffer> {
    return this.server.getGroupAvatar(key);
  }

  async modifyGroup(
    changes: Proto.GroupChange.IActions,
    options: GroupCredentialsType,
    inviteLinkBase64?: string
  ): Promise<Proto.IGroupChange> {
    return this.server.modifyGroup(changes, options, inviteLinkBase64);
  }

  async sendWithSenderKey(
    data: ArrayBuffer,
    accessKeys: ArrayBuffer,
    timestamp: number,
    online?: boolean
  ): Promise<MultiRecipient200ResponseType> {
    return this.server.sendWithSenderKey(data, accessKeys, timestamp, online);
  }

  async fetchLinkPreviewMetadata(
    href: string,
    abortSignal: AbortSignal
  ): Promise<null | LinkPreviewMetadata> {
    return this.server.fetchLinkPreviewMetadata(href, abortSignal);
  }

  async fetchLinkPreviewImage(
    href: string,
    abortSignal: AbortSignal
  ): Promise<null | LinkPreviewImage> {
    return this.server.fetchLinkPreviewImage(href, abortSignal);
  }

  async makeProxiedRequest(
    url: string,
    options?: ProxiedRequestOptionsType
  ): Promise<any> {
    return this.server.makeProxiedRequest(url, options);
  }

  async getStorageCredentials(): Promise<StorageServiceCredentials> {
    return this.server.getStorageCredentials();
  }

  async getStorageManifest(
    options: StorageServiceCallOptionsType
  ): Promise<ArrayBuffer> {
    return this.server.getStorageManifest(options);
  }

  async getStorageRecords(
    data: ArrayBuffer,
    options: StorageServiceCallOptionsType
  ): Promise<ArrayBuffer> {
    return this.server.getStorageRecords(data, options);
  }

  async modifyStorageRecords(
    data: ArrayBuffer,
    options: StorageServiceCallOptionsType
  ): Promise<ArrayBuffer> {
    return this.server.modifyStorageRecords(data, options);
  }

  async getGroupMembershipToken(
    options: GroupCredentialsType
  ): Promise<Proto.GroupExternalCredential> {
    return this.server.getGroupExternalCredential(options);
  }

  public async sendChallengeResponse(
    challengeResponse: ChallengeType
  ): Promise<void> {
    return this.server.sendChallengeResponse(challengeResponse);
  }
}
