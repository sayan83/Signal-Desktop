// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createSelector } from 'reselect';

import { ITEM_NAME as UNIVERSAL_EXPIRE_TIMER_ITEM } from '../../util/universalExpireTimer';

import { StateType } from '../reducer';
import { ItemsStateType } from '../ducks/items';
import {
  ConversationColorType,
  CustomColorType,
  DEFAULT_CONVERSATION_COLOR,
} from '../../types/Colors';

export const getItems = (state: StateType): ItemsStateType => state.items;

export const getUserAgent = createSelector(
  getItems,
  (state: ItemsStateType): string => state.userAgent as string
);

export const getReadReceiptSetting = createSelector(
  getItems,
  (state: ItemsStateType): boolean => Boolean(state['read-receipt-setting'])
);

export const getPinnedConversationIds = createSelector(
  getItems,
  (state: ItemsStateType): Array<string> =>
    (state.pinnedConversationIds || []) as Array<string>
);

export const getUniversalExpireTimer = createSelector(
  getItems,
  (state: ItemsStateType): number => state[UNIVERSAL_EXPIRE_TIMER_ITEM] || 0
);

export const getDefaultConversationColor = createSelector(
  getItems,
  (
    state: ItemsStateType
  ): {
    color: ConversationColorType;
    customColorData?: {
      id: string;
      value: CustomColorType;
    };
  } => state.defaultConversationColor ?? DEFAULT_CONVERSATION_COLOR
);
