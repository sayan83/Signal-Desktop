// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { sample } from 'lodash';
import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { v4 as generateUuid } from 'uuid';

import { CallingParticipantsList, PropsType } from './CallingParticipantsList';
import { AvatarColors } from '../types/Colors';
import { GroupCallRemoteParticipantType } from '../types/Calling';
import { getDefaultConversation } from '../test-both/helpers/getDefaultConversation';
import { setup as setupI18n } from '../../js/modules/i18n';
import enMessages from '../../_locales/en/messages.json';

const i18n = setupI18n('en', enMessages);

function createParticipant(
  participantProps: Partial<GroupCallRemoteParticipantType>
): GroupCallRemoteParticipantType {
  return {
    demuxId: 2,
    hasRemoteAudio: Boolean(participantProps.hasRemoteAudio),
    hasRemoteVideo: Boolean(participantProps.hasRemoteVideo),
    presenting: Boolean(participantProps.presenting),
    sharingScreen: Boolean(participantProps.sharingScreen),
    videoAspectRatio: 1.3,
    ...getDefaultConversation({
      avatarPath: participantProps.avatarPath,
      color: sample(AvatarColors),
      isBlocked: Boolean(participantProps.isBlocked),
      name: participantProps.name,
      profileName: participantProps.title,
      title: String(participantProps.title),
      uuid: generateUuid(),
    }),
  };
}

const createProps = (overrideProps: Partial<PropsType> = {}): PropsType => ({
  i18n,
  onClose: action('on-close'),
  ourUuid: 'cf085e6a-e70b-41ec-a310-c198248af13f',
  participants: overrideProps.participants || [],
});

const story = storiesOf('Components/CallingParticipantsList', module);

story.add('No one', () => {
  const props = createProps();
  return <CallingParticipantsList {...props} />;
});

story.add('Solo Call', () => {
  const props = createProps({
    participants: [
      createParticipant({
        title: 'Bardock',
      }),
    ],
  });
  return <CallingParticipantsList {...props} />;
});

story.add('Many Participants', () => {
  const props = createProps({
    participants: [
      createParticipant({
        title: 'Son Goku',
      }),
      createParticipant({
        hasRemoteAudio: true,
        presenting: true,
        name: 'Rage Trunks',
        title: 'Rage Trunks',
      }),
      createParticipant({
        hasRemoteAudio: true,
        title: 'Prince Vegeta',
      }),
      createParticipant({
        hasRemoteAudio: true,
        hasRemoteVideo: true,
        name: 'Goku Black',
        title: 'Goku Black',
      }),
      createParticipant({
        title: 'Supreme Kai Zamasu',
      }),
    ],
  });
  return <CallingParticipantsList {...props} />;
});

story.add('Overflow', () => {
  const props = createProps({
    participants: Array(50)
      .fill(null)
      .map(() => createParticipant({ title: 'Kirby' })),
  });
  return <CallingParticipantsList {...props} />;
});
