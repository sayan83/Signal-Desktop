// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { action } from '@storybook/addon-actions';
import { storiesOf } from '@storybook/react';

import { SafetyNumberChangeDialog } from './SafetyNumberChangeDialog';
import { getDefaultConversation } from '../test-both/helpers/getDefaultConversation';
import { setup as setupI18n } from '../../js/modules/i18n';
import enMessages from '../../_locales/en/messages.json';

const i18n = setupI18n('en', enMessages);

const contactWithAllData = getDefaultConversation({
  id: 'abc',
  avatarPath: undefined,
  color: 'ultramarine',
  profileName: '-*Smartest Dude*-',
  title: 'Rick Sanchez',
  name: 'Rick Sanchez',
  phoneNumber: '(305) 123-4567',
});

const contactWithJustProfile = getDefaultConversation({
  id: 'def',
  avatarPath: undefined,
  color: 'ultramarine',
  title: '-*Smartest Dude*-',
  profileName: '-*Smartest Dude*-',
  name: undefined,
  phoneNumber: '(305) 123-4567',
});

const contactWithJustNumber = getDefaultConversation({
  id: 'xyz',
  avatarPath: undefined,
  color: 'ultramarine',
  profileName: undefined,
  name: undefined,
  title: '(305) 123-4567',
  phoneNumber: '(305) 123-4567',
});

const contactWithNothing = getDefaultConversation({
  id: 'some-guid',
  avatarPath: undefined,
  color: 'ultramarine',
  profileName: undefined,
  name: undefined,
  phoneNumber: undefined,
  title: 'Unknown contact',
});

storiesOf('Components/SafetyNumberChangeDialog', module)
  .add('Single Contact Dialog', () => {
    return (
      <SafetyNumberChangeDialog
        contacts={[contactWithAllData]}
        i18n={i18n}
        onCancel={action('cancel')}
        onConfirm={action('confirm')}
        renderSafetyNumber={() => {
          action('renderSafetyNumber');
          return <div>This is a mock Safety Number View</div>;
        }}
      />
    );
  })
  .add('Different Confirmation Text', () => {
    return (
      <SafetyNumberChangeDialog
        confirmText="You are awesome"
        contacts={[contactWithAllData]}
        i18n={i18n}
        onCancel={action('cancel')}
        onConfirm={action('confirm')}
        renderSafetyNumber={() => {
          action('renderSafetyNumber');
          return <div>This is a mock Safety Number View</div>;
        }}
      />
    );
  })
  .add('Multi Contact Dialog', () => {
    return (
      <SafetyNumberChangeDialog
        contacts={[
          contactWithAllData,
          contactWithJustProfile,
          contactWithJustNumber,
          contactWithNothing,
        ]}
        i18n={i18n}
        onCancel={action('cancel')}
        onConfirm={action('confirm')}
        renderSafetyNumber={() => {
          action('renderSafetyNumber');
          return <div>This is a mock Safety Number View</div>;
        }}
      />
    );
  })
  .add('Scroll Dialog', () => {
    return (
      <SafetyNumberChangeDialog
        contacts={[
          contactWithAllData,
          contactWithJustProfile,
          contactWithJustNumber,
          contactWithNothing,
          contactWithAllData,
          contactWithAllData,
          contactWithAllData,
          contactWithAllData,
          contactWithAllData,
          contactWithAllData,
        ]}
        i18n={i18n}
        onCancel={action('cancel')}
        onConfirm={action('confirm')}
        renderSafetyNumber={() => {
          action('renderSafetyNumber');
          return <div>This is a mock Safety Number View</div>;
        }}
      />
    );
  });
