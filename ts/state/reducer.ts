// Copyright 2019-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { combineReducers } from 'redux';

import { reducer as accounts } from './ducks/accounts';
import { reducer as app } from './ducks/app';
import { reducer as audioPlayer } from './ducks/audioPlayer';
import { reducer as calling } from './ducks/calling';
import { reducer as conversations } from './ducks/conversations';
import { reducer as emojis } from './ducks/emojis';
import { reducer as expiration } from './ducks/expiration';
import { reducer as globalModals } from './ducks/globalModals';
import { reducer as items } from './ducks/items';
import { reducer as linkPreviews } from './ducks/linkPreviews';
import { reducer as network } from './ducks/network';
import { reducer as safetyNumber } from './ducks/safetyNumber';
import { reducer as search } from './ducks/search';
import { reducer as stickers } from './ducks/stickers';
import { reducer as updates } from './ducks/updates';
import { reducer as user } from './ducks/user';

export const reducer = combineReducers({
  accounts,
  app,
  audioPlayer,
  calling,
  conversations,
  emojis,
  expiration,
  globalModals,
  items,
  linkPreviews,
  network,
  safetyNumber,
  search,
  stickers,
  updates,
  user,
});

export type StateType = ReturnType<typeof reducer>;
