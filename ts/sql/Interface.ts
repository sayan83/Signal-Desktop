// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConversationAttributesType,
  ConversationModelCollectionType,
  MessageAttributesType,
  MessageModelCollectionType,
} from '../model-types.d';
import { MessageModel } from '../models/messages';
import { ConversationModel } from '../models/conversations';
import { StoredJob } from '../jobs/types';
import { ReactionType } from '../types/Reactions';
import { ConversationColorType, CustomColorType } from '../types/Colors';
import { StorageAccessType } from '../types/Storage.d';
import { AttachmentType } from '../types/Attachment';

export type AttachmentDownloadJobTypeType =
  | 'long-message'
  | 'attachment'
  | 'preview'
  | 'contact'
  | 'quote'
  | 'sticker';

export type AttachmentDownloadJobType = {
  attachment: AttachmentType;
  attempts: number;
  id: string;
  index: number;
  messageId: string;
  pending: number;
  timestamp: number;
  type: AttachmentDownloadJobTypeType;
};
export type MessageMetricsType = {
  id: string;
  // eslint-disable-next-line camelcase
  received_at: number;
  // eslint-disable-next-line camelcase
  sent_at: number;
};
export type ConversationMetricsType = {
  oldest?: MessageMetricsType;
  newest?: MessageMetricsType;
  oldestUnread?: MessageMetricsType;
  totalUnread: number;
};
export type ConversationType = ConversationAttributesType;
export type EmojiType = {
  shortName: string;
  lastUsage: number;
};
export type IdentityKeyType = {
  firstUse: boolean;
  id: string;
  nonblockingApproval: boolean;
  publicKey: ArrayBuffer;
  timestamp: number;
  verified: number;
};
export type ItemKeyType = keyof StorageAccessType;
export type AllItemsType = Partial<StorageAccessType>;
export type ItemType<K extends ItemKeyType> = {
  id: K;
  value: StorageAccessType[K];
};
export type MessageType = MessageAttributesType;
export type MessageTypeUnhydrated = {
  json: string;
};
export type PreKeyType = {
  id: number;
  privateKey: ArrayBuffer;
  publicKey: ArrayBuffer;
};
export type SearchResultMessageType = {
  json: string;
  snippet: string;
};
export type ClientSearchResultMessageType = MessageType & {
  json: string;
  bodyRanges: [];
  snippet: string;
};
export type SenderKeyType = {
  // Primary key
  id: string;
  // These two are combined into one string to give us the final id
  senderId: string;
  distributionId: string;
  // Raw data to serialize/deserialize into signal-client SenderKeyRecord
  data: Buffer;
  lastUpdatedDate: number;
};
export type SessionType = {
  id: string;
  conversationId: string;
  deviceId: number;
  record: string;
  version?: number;
};
export type SignedPreKeyType = {
  confirmed: boolean;
  // eslint-disable-next-line camelcase
  created_at: number;
  id: number;
  privateKey: ArrayBuffer;
  publicKey: ArrayBuffer;
};
export type StickerPackStatusType =
  | 'known'
  | 'ephemeral'
  | 'downloaded'
  | 'installed'
  | 'pending'
  | 'error';

export type StickerType = {
  id: number;
  packId: string;

  emoji: string | null;
  isCoverOnly: boolean;
  lastUsed?: number;
  path: string;
  width: number;
  height: number;
};
export type StickerPackType = {
  id: string;
  key: string;

  attemptedStatus: 'downloaded' | 'installed' | 'ephemeral';
  author: string;
  coverStickerId: number;
  createdAt: number;
  downloadAttempts: number;
  installedAt: number | null;
  lastUsed: number;
  status: StickerPackStatusType;
  stickerCount: number;
  stickers: ReadonlyArray<string>;
  title: string;
};
export type UnprocessedType = {
  id: string;
  timestamp: number;
  version: number;
  attempts: number;
  envelope?: string;

  source?: string;
  sourceUuid?: string;
  sourceDevice?: number;
  serverGuid?: string;
  serverTimestamp?: number;
  decrypted?: string;
};

export type UnprocessedUpdateType = {
  source?: string;
  sourceUuid?: string;
  sourceDevice?: string;
  serverGuid?: string;
  serverTimestamp?: number;
  decrypted?: string;
};

export type DataInterface = {
  close: () => Promise<void>;
  removeDB: () => Promise<void>;
  removeIndexedDBFiles: () => Promise<void>;

  createOrUpdateIdentityKey: (data: IdentityKeyType) => Promise<void>;
  getIdentityKeyById: (id: string) => Promise<IdentityKeyType | undefined>;
  bulkAddIdentityKeys: (array: Array<IdentityKeyType>) => Promise<void>;
  removeIdentityKeyById: (id: string) => Promise<void>;
  removeAllIdentityKeys: () => Promise<void>;
  getAllIdentityKeys: () => Promise<Array<IdentityKeyType>>;

  createOrUpdatePreKey: (data: PreKeyType) => Promise<void>;
  getPreKeyById: (id: number) => Promise<PreKeyType | undefined>;
  bulkAddPreKeys: (array: Array<PreKeyType>) => Promise<void>;
  removePreKeyById: (id: number) => Promise<void>;
  removeAllPreKeys: () => Promise<void>;
  getAllPreKeys: () => Promise<Array<PreKeyType>>;

  createOrUpdateSignedPreKey: (data: SignedPreKeyType) => Promise<void>;
  getSignedPreKeyById: (id: number) => Promise<SignedPreKeyType | undefined>;
  bulkAddSignedPreKeys: (array: Array<SignedPreKeyType>) => Promise<void>;
  removeSignedPreKeyById: (id: number) => Promise<void>;
  removeAllSignedPreKeys: () => Promise<void>;
  getAllSignedPreKeys: () => Promise<Array<SignedPreKeyType>>;

  createOrUpdateItem<K extends ItemKeyType>(data: ItemType<K>): Promise<void>;
  getItemById<K extends ItemKeyType>(id: K): Promise<ItemType<K> | undefined>;
  removeItemById: (id: ItemKeyType) => Promise<void>;
  removeAllItems: () => Promise<void>;
  getAllItems: () => Promise<AllItemsType>;

  createOrUpdateSenderKey: (key: SenderKeyType) => Promise<void>;
  getSenderKeyById: (id: string) => Promise<SenderKeyType | undefined>;
  removeAllSenderKeys: () => Promise<void>;
  getAllSenderKeys: () => Promise<Array<SenderKeyType>>;
  removeSenderKeyById: (id: string) => Promise<void>;

  createOrUpdateSession: (data: SessionType) => Promise<void>;
  createOrUpdateSessions: (array: Array<SessionType>) => Promise<void>;
  commitSessionsAndUnprocessed(options: {
    sessions: Array<SessionType>;
    unprocessed: Array<UnprocessedType>;
  }): Promise<void>;
  bulkAddSessions: (array: Array<SessionType>) => Promise<void>;
  removeSessionById: (id: string) => Promise<void>;
  removeSessionsByConversation: (conversationId: string) => Promise<void>;
  removeAllSessions: () => Promise<void>;
  getAllSessions: () => Promise<Array<SessionType>>;

  eraseStorageServiceStateFromConversations: () => Promise<void>;
  getConversationCount: () => Promise<number>;
  saveConversation: (data: ConversationType) => Promise<void>;
  saveConversations: (array: Array<ConversationType>) => Promise<void>;
  updateConversations: (array: Array<ConversationType>) => Promise<void>;
  getAllConversationIds: () => Promise<Array<string>>;

  searchConversations: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<ConversationType>>;

  getMessageCount: (conversationId?: string) => Promise<number>;
  hasUserInitiatedMessages: (conversationId: string) => Promise<boolean>;
  getAllMessageIds: () => Promise<Array<string>>;
  getMessageMetricsForConversation: (
    conversationId: string
  ) => Promise<ConversationMetricsType>;
  hasGroupCallHistoryMessage: (
    conversationId: string,
    eraId: string
  ) => Promise<boolean>;
  migrateConversationMessages: (
    obsoleteId: string,
    currentId: string
  ) => Promise<void>;
  getNextTapToViewMessageTimestampToAgeOut: () => Promise<undefined | number>;

  getUnprocessedCount: () => Promise<number>;
  getAllUnprocessed: () => Promise<Array<UnprocessedType>>;
  updateUnprocessedAttempts: (id: string, attempts: number) => Promise<void>;
  updateUnprocessedWithData: (
    id: string,
    data: UnprocessedUpdateType
  ) => Promise<void>;
  updateUnprocessedsWithData: (
    array: Array<{ id: string; data: UnprocessedUpdateType }>
  ) => Promise<void>;
  getUnprocessedById: (id: string) => Promise<UnprocessedType | undefined>;
  removeUnprocessed: (id: string | Array<string>) => Promise<void>;
  removeAllUnprocessed: () => Promise<void>;

  getNextAttachmentDownloadJobs: (
    limit?: number,
    options?: { timestamp?: number }
  ) => Promise<Array<AttachmentDownloadJobType>>;
  saveAttachmentDownloadJob: (job: AttachmentDownloadJobType) => Promise<void>;
  setAttachmentDownloadJobPending: (
    id: string,
    pending: boolean
  ) => Promise<void>;
  resetAttachmentDownloadPending: () => Promise<void>;
  removeAttachmentDownloadJob: (id: string) => Promise<void>;
  removeAllAttachmentDownloadJobs: () => Promise<void>;

  createOrUpdateStickerPack: (pack: StickerPackType) => Promise<void>;
  updateStickerPackStatus: (
    id: string,
    status: StickerPackStatusType,
    options?: { timestamp: number }
  ) => Promise<void>;
  createOrUpdateSticker: (sticker: StickerType) => Promise<void>;
  updateStickerLastUsed: (
    packId: string,
    stickerId: number,
    lastUsed: number
  ) => Promise<void>;
  addStickerPackReference: (messageId: string, packId: string) => Promise<void>;
  deleteStickerPackReference: (
    messageId: string,
    packId: string
  ) => Promise<Array<string>>;
  getStickerCount: () => Promise<number>;
  deleteStickerPack: (packId: string) => Promise<Array<string>>;
  getAllStickerPacks: () => Promise<Array<StickerPackType>>;
  getAllStickers: () => Promise<Array<StickerType>>;
  getRecentStickers: (options?: {
    limit?: number;
  }) => Promise<Array<StickerType>>;
  clearAllErrorStickerPackAttempts: () => Promise<void>;

  updateEmojiUsage: (shortName: string, timeUsed?: number) => Promise<void>;
  getRecentEmojis: (limit?: number) => Promise<Array<EmojiType>>;

  removeAll: () => Promise<void>;
  removeAllConfiguration: () => Promise<void>;

  getMessagesNeedingUpgrade: (
    limit: number,
    options: { maxVersion: number }
  ) => Promise<Array<MessageType>>;
  getMessagesWithVisualMediaAttachments: (
    conversationId: string,
    options: { limit: number }
  ) => Promise<Array<MessageType>>;
  getMessagesWithFileAttachments: (
    conversationId: string,
    options: { limit: number }
  ) => Promise<Array<MessageType>>;
  getMessageServerGuidsForSpam: (
    conversationId: string
  ) => Promise<Array<string>>;
  getMessagesUnexpectedlyMissingExpirationStartTimestamp: () => Promise<
    Array<MessageType>
  >;
  getSoonestMessageExpiry: () => Promise<undefined | number>;

  getJobsInQueue(queueType: string): Promise<Array<StoredJob>>;
  insertJob(job: Readonly<StoredJob>): Promise<void>;
  deleteJob(id: string): Promise<void>;

  updateAllConversationColors: (
    conversationColor?: ConversationColorType,
    customColorData?: {
      id: string;
      value: CustomColorType;
    }
  ) => Promise<void>;
};

// The reason for client/server divergence is the need to inject Backbone models and
//   collections into data calls so those are the objects returned. This was necessary in
//   July 2018 when creating the Data API as a drop-in replacement for previous database
//   requests via ORM.

// Note: It is extremely important that items are duplicated between these two. Client.js
//   loops over all of its local functions to generate the server-side IPC-based API.

export type ServerInterface = DataInterface & {
  getAllConversations: () => Promise<Array<ConversationType>>;
  getAllGroupsInvolvingId: (id: string) => Promise<Array<ConversationType>>;
  getAllPrivateConversations: () => Promise<Array<ConversationType>>;
  getConversationById: (id: string) => Promise<ConversationType | undefined>;
  getExpiredMessages: () => Promise<Array<MessageType>>;
  getMessageById: (id: string) => Promise<MessageType | undefined>;
  getMessageBySender: (options: {
    source: string;
    sourceUuid: string;
    sourceDevice: string;
    sent_at: number;
  }) => Promise<Array<MessageType>>;
  getMessagesBySentAt: (sentAt: number) => Promise<Array<MessageType>>;
  getOlderMessagesByConversation: (
    conversationId: string,
    options?: {
      limit?: number;
      receivedAt?: number;
      sentAt?: number;
      messageId?: string;
    }
  ) => Promise<Array<MessageTypeUnhydrated>>;
  getNewerMessagesByConversation: (
    conversationId: string,
    options?: { limit?: number; receivedAt?: number; sentAt?: number }
  ) => Promise<Array<MessageTypeUnhydrated>>;
  getLastConversationActivity: (options: {
    conversationId: string;
    ourConversationId: string;
  }) => Promise<MessageType | undefined>;
  getLastConversationPreview: (options: {
    conversationId: string;
    ourConversationId: string;
  }) => Promise<MessageType | undefined>;
  getTapToViewMessagesNeedingErase: () => Promise<Array<MessageType>>;
  getUnreadCountForConversation: (conversationId: string) => Promise<number>;
  getUnreadByConversationAndMarkRead: (
    conversationId: string,
    newestUnreadId: number,
    readAt?: number
  ) => Promise<
    Array<
      Pick<MessageType, 'id' | 'source' | 'sourceUuid' | 'sent_at' | 'type'>
    >
  >;
  getUnreadReactionsAndMarkRead: (
    conversationId: string,
    newestUnreadId: number
  ) => Promise<
    Array<Pick<ReactionType, 'targetAuthorUuid' | 'targetTimestamp'>>
  >;
  markReactionAsRead: (
    targetAuthorUuid: string,
    targetTimestamp: number
  ) => Promise<ReactionType | undefined>;
  removeReactionFromConversation: (reaction: {
    emoji: string;
    fromId: string;
    targetAuthorUuid: string;
    targetTimestamp: number;
  }) => Promise<void>;
  addReaction: (reactionObj: ReactionType) => Promise<void>;
  removeConversation: (id: Array<string> | string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  removeMessages: (ids: Array<string>) => Promise<void>;
  searchMessages: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<SearchResultMessageType>>;
  searchMessagesInConversation: (
    query: string,
    conversationId: string,
    options?: { limit?: number }
  ) => Promise<Array<SearchResultMessageType>>;
  saveMessage: (
    data: MessageType,
    options: { forceSave?: boolean }
  ) => Promise<string>;
  saveMessages: (
    arrayOfMessages: Array<MessageType>,
    options: { forceSave?: boolean }
  ) => Promise<void>;
  updateConversation: (data: ConversationType) => Promise<void>;

  // For testing only
  _getAllMessages: () => Promise<Array<MessageType>>;

  // Server-only

  initialize: (options: { configDir: string; key: string }) => Promise<void>;

  initializeRenderer: (options: {
    configDir: string;
    key: string;
  }) => Promise<void>;

  removeKnownAttachments: (
    allAttachments: Array<string>
  ) => Promise<Array<string>>;
  removeKnownStickers: (allStickers: Array<string>) => Promise<Array<string>>;
  removeKnownDraftAttachments: (
    allStickers: Array<string>
  ) => Promise<Array<string>>;
};

export type ClientInterface = DataInterface & {
  getAllConversations: (options: {
    ConversationCollection: typeof ConversationModelCollectionType;
  }) => Promise<ConversationModelCollectionType>;
  getAllGroupsInvolvingId: (
    id: string,
    options: {
      ConversationCollection: typeof ConversationModelCollectionType;
    }
  ) => Promise<ConversationModelCollectionType>;
  getAllPrivateConversations: (options: {
    ConversationCollection: typeof ConversationModelCollectionType;
  }) => Promise<ConversationModelCollectionType>;
  getConversationById: (
    id: string,
    options: { Conversation: typeof ConversationModel }
  ) => Promise<ConversationModel | undefined>;
  getExpiredMessages: (options: {
    MessageCollection: typeof MessageModelCollectionType;
  }) => Promise<MessageModelCollectionType>;
  getMessageById: (
    id: string,
    options: { Message: typeof MessageModel }
  ) => Promise<MessageModel | undefined>;
  getMessageBySender: (
    data: {
      source: string;
      sourceUuid: string;
      sourceDevice: string;
      sent_at: number;
    },
    options: { Message: typeof MessageModel }
  ) => Promise<MessageModel | null>;
  getMessagesBySentAt: (
    sentAt: number,
    options: { MessageCollection: typeof MessageModelCollectionType }
  ) => Promise<MessageModelCollectionType>;
  getOlderMessagesByConversation: (
    conversationId: string,
    options: {
      limit?: number;
      messageId?: string;
      receivedAt?: number;
      sentAt?: number;
      MessageCollection: typeof MessageModelCollectionType;
    }
  ) => Promise<MessageModelCollectionType>;
  getNewerMessagesByConversation: (
    conversationId: string,
    options: {
      limit?: number;
      receivedAt?: number;
      sentAt?: number;
      MessageCollection: typeof MessageModelCollectionType;
    }
  ) => Promise<MessageModelCollectionType>;
  getLastConversationActivity: (options: {
    conversationId: string;
    ourConversationId: string;
    Message: typeof MessageModel;
  }) => Promise<MessageModel | undefined>;
  getLastConversationPreview: (options: {
    conversationId: string;
    ourConversationId: string;
    Message: typeof MessageModel;
  }) => Promise<MessageModel | undefined>;
  getTapToViewMessagesNeedingErase: (options: {
    MessageCollection: typeof MessageModelCollectionType;
  }) => Promise<MessageModelCollectionType>;
  getUnreadCountForConversation: (conversationId: string) => Promise<number>;
  getUnreadByConversationAndMarkRead: (
    conversationId: string,
    newestUnreadId: number,
    readAt?: number
  ) => Promise<
    Array<
      Pick<MessageType, 'id' | 'source' | 'sourceUuid' | 'sent_at' | 'type'>
    >
  >;
  getUnreadReactionsAndMarkRead: (
    conversationId: string,
    newestUnreadId: number
  ) => Promise<
    Array<Pick<ReactionType, 'targetAuthorUuid' | 'targetTimestamp'>>
  >;
  markReactionAsRead: (
    targetAuthorUuid: string,
    targetTimestamp: number
  ) => Promise<ReactionType | undefined>;
  removeReactionFromConversation: (reaction: {
    emoji: string;
    fromId: string;
    targetAuthorUuid: string;
    targetTimestamp: number;
  }) => Promise<void>;
  addReaction: (reactionObj: ReactionType) => Promise<void>;
  removeConversation: (
    id: string,
    options: { Conversation: typeof ConversationModel }
  ) => Promise<void>;
  removeMessage: (
    id: string,
    options: { Message: typeof MessageModel }
  ) => Promise<void>;
  removeMessages: (
    ids: Array<string>,
    options: { Message: typeof MessageModel }
  ) => Promise<void>;
  saveMessage: (
    data: MessageType,
    options: { forceSave?: boolean; Message: typeof MessageModel }
  ) => Promise<string>;
  saveMessages: (
    arrayOfMessages: Array<MessageType>,
    options: { forceSave?: boolean; Message: typeof MessageModel }
  ) => Promise<void>;
  searchMessages: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<ClientSearchResultMessageType>>;
  searchMessagesInConversation: (
    query: string,
    conversationId: string,
    options?: { limit?: number }
  ) => Promise<Array<ClientSearchResultMessageType>>;
  updateConversation: (data: ConversationType, extra?: unknown) => void;

  // Test-only

  _getAllMessages: (options: {
    MessageCollection: typeof MessageModelCollectionType;
  }) => Promise<MessageModelCollectionType>;

  // Client-side only

  shutdown: () => Promise<void>;
  removeAllMessagesInConversation: (
    conversationId: string,
    options: {
      logId: string;
      MessageCollection: typeof MessageModelCollectionType;
    }
  ) => Promise<void>;
  removeOtherData: () => Promise<void>;
  cleanupOrphanedAttachments: () => Promise<void>;
  ensureFilePermissions: () => Promise<void>;

  // Client-side only, and test-only

  _removeConversations: (ids: Array<string>) => Promise<void>;
  _jobs: { [id: string]: ClientJobType };

  // These are defined on the server-only and used in the client to determine
  // whether we should use IPC to use the database in the main process or
  // use the db already running in the renderer.
  goBackToMainProcess: () => Promise<void>;
};

export type ClientJobType = {
  fnName: string;
  start: number;
  resolve?: Function;
  reject?: Function;

  // Only in DEBUG mode
  complete?: boolean;
  args?: Array<any>;
};
