// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as RemoteConfig from '../RemoteConfig';
import { isBeta } from './version';

// We can remove this function once screen sharing has been turned on for everyone
export function isScreenSharingEnabled(): boolean {
  // `window.getVersion` is missing in Storybook.
  const version = window.getVersion?.();

  return Boolean(
    RemoteConfig.isEnabled('desktop.worksAtSignal') ||
      RemoteConfig.isEnabled('desktop.screensharing2') ||
      (version && isBeta(version))
  );
}
