// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { actions as accounts } from './ducks/accounts';
import { actions as app } from './ducks/app';
import { actions as audioPlayer } from './ducks/audioPlayer';
import { actions as calling } from './ducks/calling';
import { actions as conversations } from './ducks/conversations';
import { actions as emojis } from './ducks/emojis';
import { actions as expiration } from './ducks/expiration';
import { actions as globalModals } from './ducks/globalModals';
import { actions as items } from './ducks/items';
import { actions as linkPreviews } from './ducks/linkPreviews';
import { actions as network } from './ducks/network';
import { actions as safetyNumber } from './ducks/safetyNumber';
import { actions as search } from './ducks/search';
import { actions as stickers } from './ducks/stickers';
import { actions as updates } from './ducks/updates';
import { actions as user } from './ducks/user';

export type ReduxActions = {
  accounts: typeof accounts;
  app: typeof app;
  audioPlayer: typeof audioPlayer;
  calling: typeof calling;
  conversations: typeof conversations;
  emojis: typeof emojis;
  expiration: typeof expiration;
  globalModals: typeof globalModals;
  items: typeof items;
  linkPreviews: typeof linkPreviews;
  network: typeof network;
  safetyNumber: typeof safetyNumber;
  search: typeof search;
  stickers: typeof stickers;
  updates: typeof updates;
  user: typeof user;
};
