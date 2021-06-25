// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { ComponentProps } from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import { getDefaultConversation } from '../../test-both/helpers/getDefaultConversation';
import { setup as setupI18n } from '../../../js/modules/i18n';
import enMessages from '../../../_locales/en/messages.json';
import {
  ConversationHeader,
  OutgoingCallButtonStyle,
} from './ConversationHeader';
import { gifUrl } from '../../storybook/Fixtures';

const book = storiesOf('Components/Conversation/ConversationHeader', module);
const i18n = setupI18n('en', enMessages);

type ConversationHeaderStory = {
  title: string;
  description: string;
  items: Array<{
    title: string;
    props: ComponentProps<typeof ConversationHeader>;
  }>;
};

const commonProps = {
  ...getDefaultConversation(),

  showBackButton: false,
  outgoingCallButtonStyle: OutgoingCallButtonStyle.Both,

  i18n,

  onShowConversationDetails: action('onShowConversationDetails'),
  onSetDisappearingMessages: action('onSetDisappearingMessages'),
  onDeleteMessages: action('onDeleteMessages'),
  onResetSession: action('onResetSession'),
  onSearchInConversation: action('onSearchInConversation'),
  onSetMuteNotifications: action('onSetMuteNotifications'),
  onOutgoingAudioCallInConversation: action(
    'onOutgoingAudioCallInConversation'
  ),
  onOutgoingVideoCallInConversation: action(
    'onOutgoingVideoCallInConversation'
  ),

  onShowChatColorEditor: action('onShowChatColorEditor'),
  onShowSafetyNumber: action('onShowSafetyNumber'),
  onShowAllMedia: action('onShowAllMedia'),
  onShowContactModal: action('onShowContactModal'),
  onShowGroupMembers: action('onShowGroupMembers'),
  onGoBack: action('onGoBack'),

  onArchive: action('onArchive'),
  onMarkUnread: action('onMarkUnread'),
  onMoveToInbox: action('onMoveToInbox'),
  onSetPin: action('onSetPin'),
};

const stories: Array<ConversationHeaderStory> = [
  {
    title: '1:1 conversation',
    description:
      "Note the five items in menu, and the second-level menu with disappearing messages options. Disappearing message set to 'off'.",
    items: [
      {
        title: 'With name and profile, verified',
        props: {
          ...commonProps,
          color: 'crimson',
          isVerified: true,
          avatarPath: gifUrl,
          title: 'Someone 🔥 Somewhere',
          name: 'Someone 🔥 Somewhere',
          phoneNumber: '(202) 555-0001',
          type: 'direct',
          id: '1',
          profileName: '🔥Flames🔥',
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'With name, not verified, no avatar',
        props: {
          ...commonProps,
          color: 'blue',
          isVerified: false,
          title: 'Someone 🔥 Somewhere',
          name: 'Someone 🔥 Somewhere',
          phoneNumber: '(202) 555-0002',
          type: 'direct',
          id: '2',
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'With name, not verified, descenders',
        props: {
          ...commonProps,
          color: 'blue',
          isVerified: false,
          title: 'Joyrey 🔥 Leppey',
          name: 'Joyrey 🔥 Leppey',
          phoneNumber: '(202) 555-0002',
          type: 'direct',
          id: '3',
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'Profile, no name',
        props: {
          ...commonProps,
          color: 'wintergreen',
          isVerified: false,
          phoneNumber: '(202) 555-0003',
          type: 'direct',
          id: '4',
          title: '🔥Flames🔥',
          profileName: '🔥Flames🔥',
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'No name, no profile, no color',
        props: {
          ...commonProps,
          title: '(202) 555-0011',
          phoneNumber: '(202) 555-0011',
          type: 'direct',
          id: '5',
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'With back button',
        props: {
          ...commonProps,
          showBackButton: true,
          color: 'vermilion',
          phoneNumber: '(202) 555-0004',
          title: '(202) 555-0004',
          type: 'direct',
          id: '6',
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'Disappearing messages set',
        props: {
          ...commonProps,
          color: 'indigo',
          title: '(202) 555-0005',
          phoneNumber: '(202) 555-0005',
          type: 'direct',
          id: '7',
          expireTimer: 10,
          acceptedMessageRequest: true,
        },
      },
      {
        title: 'Disappearing messages + verified',
        props: {
          ...commonProps,
          color: 'indigo',
          title: '(202) 555-0005',
          phoneNumber: '(202) 555-0005',
          type: 'direct',
          id: '8',
          expireTimer: 300,
          acceptedMessageRequest: true,
          isVerified: true,
          canChangeTimer: true,
        },
      },
      {
        title: 'Muting Conversation',
        props: {
          ...commonProps,
          color: 'ultramarine',
          title: '(202) 555-0006',
          phoneNumber: '(202) 555-0006',
          type: 'direct',
          id: '9',
          acceptedMessageRequest: true,
          muteExpiresAt: new Date('3000-10-18T11:11:11Z').valueOf(),
        },
      },
      {
        title: 'SMS-only conversation',
        props: {
          ...commonProps,
          color: 'ultramarine',
          title: '(202) 555-0006',
          phoneNumber: '(202) 555-0006',
          type: 'direct',
          id: '10',
          acceptedMessageRequest: true,
          isSMSOnly: true,
        },
      },
    ],
  },
  {
    title: 'In a group',
    description:
      "Note that the menu should includes 'Show Members' instead of 'Show Safety Number'",
    items: [
      {
        title: 'Basic',
        props: {
          ...commonProps,
          color: 'ultramarine',
          title: 'Typescript support group',
          name: 'Typescript support group',
          phoneNumber: '',
          id: '11',
          type: 'group',
          expireTimer: 10,
          acceptedMessageRequest: true,
          outgoingCallButtonStyle: OutgoingCallButtonStyle.JustVideo,
        },
      },
      {
        title: 'In a group you left - no disappearing messages',
        props: {
          ...commonProps,
          color: 'ultramarine',
          title: 'Typescript support group',
          name: 'Typescript support group',
          phoneNumber: '',
          id: '12',
          type: 'group',
          left: true,
          expireTimer: 10,
          acceptedMessageRequest: true,
          outgoingCallButtonStyle: OutgoingCallButtonStyle.JustVideo,
        },
      },
      {
        title: 'In a group with an active group call',
        props: {
          ...commonProps,
          color: 'ultramarine',
          title: 'Typescript support group',
          name: 'Typescript support group',
          phoneNumber: '',
          id: '13',
          type: 'group',
          expireTimer: 10,
          acceptedMessageRequest: true,
          outgoingCallButtonStyle: OutgoingCallButtonStyle.Join,
        },
      },
      {
        title: 'In a forever muted group',
        props: {
          ...commonProps,
          color: 'ultramarine',
          title: 'Way too many messages',
          name: 'Way too many messages',
          phoneNumber: '',
          id: '14',
          type: 'group',
          expireTimer: 10,
          acceptedMessageRequest: true,
          outgoingCallButtonStyle: OutgoingCallButtonStyle.JustVideo,
          muteExpiresAt: Infinity,
        },
      },
    ],
  },
  {
    title: 'Note to Self',
    description: 'No safety number entry.',
    items: [
      {
        title: 'In chat with yourself',
        props: {
          ...commonProps,
          color: 'blue',
          title: '(202) 555-0007',
          phoneNumber: '(202) 555-0007',
          id: '15',
          type: 'direct',
          isMe: true,
          acceptedMessageRequest: true,
          outgoingCallButtonStyle: OutgoingCallButtonStyle.None,
        },
      },
    ],
  },
  {
    title: 'Unaccepted',
    description: 'No safety number entry.',
    items: [
      {
        title: '1:1 conversation',
        props: {
          ...commonProps,
          color: 'blue',
          title: '(202) 555-0007',
          phoneNumber: '(202) 555-0007',
          id: '16',
          type: 'direct',
          isMe: false,
          acceptedMessageRequest: false,
          outgoingCallButtonStyle: OutgoingCallButtonStyle.None,
        },
      },
    ],
  },
];

stories.forEach(({ title, description, items }) =>
  book.add(
    title,
    () =>
      items.map(({ title: subtitle, props }, i) => {
        return (
          <div key={i}>
            {subtitle ? <h3>{subtitle}</h3> : null}
            <ConversationHeader {...props} />
          </div>
        );
      }),
    {
      docs: description,
    }
  )
);
