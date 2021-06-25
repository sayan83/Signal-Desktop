// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type LocaleMessagesType = {
  [key: string]: {
    message: string;
    description?: string;
  };
};

export type ReplacementValuesType<T> = {
  [key: string]: T;
};

export type LocalizerType = (
  key: string,
  placeholders: Array<string> | ReplacementValuesType<string>
) => string;

export type LocaleType = {
  i18n: LocalizerType;
  messages: LocaleMessagesType;
};
