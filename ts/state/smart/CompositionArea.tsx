// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { connect } from 'react-redux';
import { get } from 'lodash';
import { mapDispatchToProps } from '../actions';
import { CompositionArea } from '../../components/CompositionArea';
import { StateType } from '../reducer';
import { isConversationSMSOnly } from '../../util/isConversationSMSOnly';

import { selectRecentEmojis } from '../selectors/emojis';
import { getIntl } from '../selectors/user';
import {
  getConversationSelector,
  isMissingRequiredProfileSharing,
} from '../selectors/conversations';
import {
  getBlessedStickerPacks,
  getInstalledStickerPacks,
  getKnownStickerPacks,
  getReceivedStickerPacks,
  getRecentlyInstalledStickerPack,
  getRecentStickers,
} from '../selectors/stickers';

type ExternalProps = {
  id: string;
};

const mapStateToProps = (state: StateType, props: ExternalProps) => {
  const { id } = props;

  const conversation = getConversationSelector(state)(id);
  if (!conversation) {
    throw new Error(`Conversation id ${id} not found!`);
  }

  const { draftText, draftBodyRanges } = conversation;

  const receivedPacks = getReceivedStickerPacks(state);
  const installedPacks = getInstalledStickerPacks(state);
  const blessedPacks = getBlessedStickerPacks(state);
  const knownPacks = getKnownStickerPacks(state);

  const installedPack = getRecentlyInstalledStickerPack(state);

  const recentStickers = getRecentStickers(state);
  const showIntroduction = get(
    state.items,
    ['showStickersIntroduction'],
    false
  );
  const showPickerHint =
    get(state.items, ['showStickerPickerHint'], false) &&
    receivedPacks.length > 0;

  const recentEmojis = selectRecentEmojis(state);

  return {
    // Base
    i18n: getIntl(state),
    draftText,
    draftBodyRanges,
    // Emojis
    recentEmojis,
    skinTone: get(state, ['items', 'skinTone'], 0),
    // Stickers
    receivedPacks,
    installedPack,
    blessedPacks,
    knownPacks,
    installedPacks,
    recentStickers,
    showIntroduction,
    showPickerHint,
    // Message Requests
    ...conversation,
    conversationType: conversation.type,
    isSMSOnly: Boolean(isConversationSMSOnly(conversation)),
    isFetchingUUID: conversation.isFetchingUUID,
    isMissingMandatoryProfileSharing: isMissingRequiredProfileSharing(
      conversation
    ),
  };
};

const dispatchPropsMap = {
  ...mapDispatchToProps,
  onSetSkinTone: (tone: number) => mapDispatchToProps.putItem('skinTone', tone),
  clearShowIntroduction: () =>
    mapDispatchToProps.removeItem('showStickersIntroduction'),
  clearShowPickerHint: () =>
    mapDispatchToProps.removeItem('showStickerPickerHint'),
  onPickEmoji: mapDispatchToProps.onUseEmoji,
};

const smart = connect(mapStateToProps, dispatchPropsMap);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SmartCompositionArea = smart(CompositionArea as any);
