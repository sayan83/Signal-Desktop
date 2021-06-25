// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { useSelector } from 'react-redux';
import { StateType } from '../reducer';

import { ContactName } from '../../components/conversation/ContactName';

import { getIntl } from '../selectors/user';
import {
  GetConversationByIdType,
  getConversationSelector,
} from '../selectors/conversations';

import { LocalizerType } from '../../types/Util';

type ExternalProps = {
  conversationId: string;
};

export const SmartContactName: React.ComponentType<ExternalProps> = props => {
  const { conversationId } = props;
  const i18n = useSelector<StateType, LocalizerType>(getIntl);
  const getConversation = useSelector<StateType, GetConversationByIdType>(
    getConversationSelector
  );

  const conversation = getConversation(conversationId) || {
    title: i18n('unknownContact'),
  };

  return (
    <ContactName
      firstName={conversation.firstName}
      i18n={i18n}
      name={conversation.name}
      phoneNumber={conversation.phoneNumber}
      profileName={conversation.profileName}
      title={conversation.title}
    />
  );
};
