// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useRef, useEffect, useState } from 'react';
import classNames from 'classnames';
import { noop } from 'lodash';

import { assert } from '../../util/assert';
import { LocalizerType } from '../../types/Util';
import { hasNotDownloaded, AttachmentType } from '../../types/Attachment';

import { ComputePeaksResult } from '../GlobalAudioContext';

export type Props = {
  direction?: 'incoming' | 'outgoing';
  id: string;
  i18n: LocalizerType;
  attachment: AttachmentType;
  withContentAbove: boolean;
  withContentBelow: boolean;

  // See: GlobalAudioContext.tsx
  audio: HTMLAudioElement;

  buttonRef: React.RefObject<HTMLButtonElement>;
  kickOffAttachmentDownload(): void;
  onCorrupted(): void;

  computePeaks(url: string, barCount: number): Promise<ComputePeaksResult>;
  activeAudioID: string | undefined;
  setActiveAudioID: (id: string | undefined) => void;
};

type ButtonProps = {
  i18n: LocalizerType;
  buttonRef: React.RefObject<HTMLButtonElement>;

  mod: string;
  label: string;
  onClick: () => void;
};

enum State {
  NotDownloaded = 'NotDownloaded',
  Pending = 'Pending',
  Computing = 'Computing',
  Normal = 'Normal',
}

// Constants

const CSS_BASE = 'module-message__audio-attachment';
const BAR_COUNT = 47;
const BAR_NOT_DOWNLOADED_HEIGHT = 2;
const BAR_MIN_HEIGHT = 4;
const BAR_MAX_HEIGHT = 20;

const REWIND_BAR_COUNT = 2;

// Increments for keyboard audio seek (in seconds)
const SMALL_INCREMENT = 1;
const BIG_INCREMENT = 5;

// Utils

const timeToText = (time: number): string => {
  const hours = Math.floor(time / 3600);
  let minutes = Math.floor((time % 3600) / 60).toString();
  let seconds = Math.floor(time % 60).toString();

  if (hours !== 0 && minutes.length < 2) {
    minutes = `0${minutes}`;
  }

  if (seconds.length < 2) {
    seconds = `0${seconds}`;
  }

  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
};

const Button: React.FC<ButtonProps> = props => {
  const { i18n, buttonRef, mod, label, onClick } = props;
  // Clicking button toggle playback
  const onButtonClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    onClick();
  };

  // Keyboard playback toggle
  const onButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== 'Space') {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    onClick();
  };

  return (
    <button
      type="button"
      ref={buttonRef}
      className={classNames(
        `${CSS_BASE}__button`,
        `${CSS_BASE}__button--${mod}`
      )}
      onClick={onButtonClick}
      onKeyDown={onButtonKeyDown}
      tabIndex={0}
      aria-label={i18n(label)}
    />
  );
};

/**
 * Display message audio attachment along with its waveform, duration, and
 * toggle Play/Pause button.
 *
 * A global audio player is used for playback and access is managed by the
 * `activeAudioID` property. Whenever `activeAudioID` property is equal to `id`
 * the instance of the `MessageAudio` assumes the ownership of the `Audio`
 * instance and fully manages it.
 */
export const MessageAudio: React.FC<Props> = (props: Props) => {
  const {
    i18n,
    id,
    direction,
    attachment,
    withContentAbove,
    withContentBelow,

    buttonRef,
    kickOffAttachmentDownload,
    onCorrupted,

    audio,
    computePeaks,

    activeAudioID,
    setActiveAudioID,
  } = props;

  assert(audio !== null, 'GlobalAudioContext always provides audio');

  const isActive = activeAudioID === id;

  const waveformRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(isActive && !audio.paused);
  const [currentTime, setCurrentTime] = useState(
    isActive ? audio.currentTime : 0
  );

  // NOTE: Avoid division by zero
  const [duration, setDuration] = useState(1e-23);

  const [hasPeaks, setHasPeaks] = useState(false);
  const [peaks, setPeaks] = useState<ReadonlyArray<number>>(
    new Array(BAR_COUNT).fill(0)
  );

  let state: State;

  if (attachment.pending) {
    state = State.Pending;
  } else if (hasNotDownloaded(attachment)) {
    state = State.NotDownloaded;
  } else if (!hasPeaks) {
    state = State.Computing;
  } else {
    state = State.Normal;
  }

  // This effect loads audio file and computes its RMS peak for dispalying the
  // waveform.
  useEffect(() => {
    if (state !== State.Computing) {
      return noop;
    }

    window.log.info('MessageAudio: loading audio and computing waveform');

    let canceled = false;

    (async () => {
      try {
        if (!attachment.url) {
          throw new Error(
            'Expected attachment url in the MessageAudio with ' +
              `state: ${state}`
          );
        }

        const { peaks: newPeaks, duration: newDuration } = await computePeaks(
          attachment.url,
          BAR_COUNT
        );
        if (canceled) {
          return;
        }
        setPeaks(newPeaks);
        setHasPeaks(true);
        setDuration(Math.max(newDuration, 1e-23));
      } catch (err) {
        window.log.error(
          'MessageAudio: computePeaks error, marking as corrupted',
          err
        );

        onCorrupted();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [
    attachment,
    computePeaks,
    setDuration,
    setPeaks,
    setHasPeaks,
    onCorrupted,
    state,
  ]);

  // This effect attaches/detaches event listeners to the global <audio/>
  // instance that we reuse from the GlobalAudioContext.
  //
  // Audio playback changes `audio.currentTime` so we have to propagate this
  // to the waveform UI.
  //
  // When audio ends - we have to change state and reset the position of the
  // waveform.
  useEffect(() => {
    // Owner of Audio instance changed
    if (!isActive) {
      window.log.info('MessageAudio: pausing old owner', id);
      setIsPlaying(false);
      setCurrentTime(0);
      return noop;
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      window.log.info('MessageAudio: ended, changing UI', id);
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onLoadedMetadata = () => {
      assert(
        !Number.isNaN(audio.duration),
        'Audio should have definite duration on `loadedmetadata` event'
      );

      window.log.info('MessageAudio: `loadedmetadata` event', id);

      // Sync-up audio's time in case if <audio/> loaded its source after
      // user clicked on waveform
      audio.currentTime = currentTime;
    };

    const onDurationChange = () => {
      window.log.info('MessageAudio: `durationchange` event', id);

      if (!Number.isNaN(audio.duration)) {
        setDuration(Math.max(audio.duration, 1e-23));
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  }, [id, audio, isActive, currentTime]);

  // This effect detects `isPlaying` changes and starts/pauses playback when
  // needed (+keeps waveform position and audio position in sync).
  useEffect(() => {
    if (!isActive) {
      return;
    }

    if (isPlaying) {
      if (!audio.paused) {
        return;
      }

      window.log.info('MessageAudio: resuming playback for', id);
      audio.currentTime = currentTime;
      audio.play().catch(error => {
        window.log.info('MessageAudio: resume error', id, error.stack || error);
      });
    } else {
      window.log.info('MessageAudio: pausing playback for', id);
      audio.pause();
    }
  }, [id, audio, isActive, isPlaying, currentTime]);

  const toggleIsPlaying = () => {
    setIsPlaying(!isPlaying);

    if (!isActive && !isPlaying) {
      window.log.info('MessageAudio: changing owner', id);
      setActiveAudioID(id);

      // Pause old audio
      if (!audio.paused) {
        audio.pause();
      }

      if (!attachment.url) {
        throw new Error(
          'Expected attachment url in the MessageAudio with ' +
            `state: ${state}`
        );
      }
      audio.src = attachment.url;
    }
  };

  // Clicking waveform moves playback head position and starts playback.
  const onWaveformClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (state !== State.Normal) {
      return;
    }

    if (!isPlaying) {
      toggleIsPlaying();
    }

    if (!waveformRef.current) {
      return;
    }

    const boundingRect = waveformRef.current.getBoundingClientRect();
    let progress = (event.pageX - boundingRect.left) / boundingRect.width;

    if (progress <= REWIND_BAR_COUNT / BAR_COUNT) {
      progress = 0;
    }

    if (isPlaying && !Number.isNaN(audio.duration)) {
      audio.currentTime = audio.duration * progress;
    } else {
      setCurrentTime(duration * progress);
    }
  };

  // Keyboard navigation for waveform. Pressing keys moves playback head
  // forward/backwards.
  const onWaveformKeyDown = (event: React.KeyboardEvent) => {
    let increment: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      increment = +SMALL_INCREMENT;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      increment = -SMALL_INCREMENT;
    } else if (event.key === 'PageUp') {
      increment = +BIG_INCREMENT;
    } else if (event.key === 'PageDown') {
      increment = -BIG_INCREMENT;
    } else {
      // We don't handle other keys
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // There is no audio to rewind
    if (!isActive) {
      return;
    }

    audio.currentTime = Math.min(
      Number.isNaN(audio.duration) ? Infinity : audio.duration,
      Math.max(0, audio.currentTime + increment)
    );

    if (!isPlaying) {
      toggleIsPlaying();
    }
  };

  const peakPosition = peaks.length * (currentTime / duration);

  const waveform = (
    <div
      ref={waveformRef}
      className={`${CSS_BASE}__waveform`}
      onClick={onWaveformClick}
      onKeyDown={onWaveformKeyDown}
      tabIndex={0}
      role="slider"
      aria-label={i18n('MessageAudio--slider')}
      aria-orientation="horizontal"
      aria-valuenow={currentTime}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuetext={timeToText(currentTime)}
    >
      {peaks.map((peak, i) => {
        let height = Math.max(BAR_MIN_HEIGHT, BAR_MAX_HEIGHT * peak);
        if (state !== State.Normal) {
          height = BAR_NOT_DOWNLOADED_HEIGHT;
        }

        const highlight = i < peakPosition;

        // Use maximum height for current audio position
        if (highlight && i + 1 >= peakPosition) {
          height = BAR_MAX_HEIGHT;
        }

        const key = i;

        return (
          <div
            className={classNames([
              `${CSS_BASE}__waveform__bar`,
              highlight ? `${CSS_BASE}__waveform__bar--active` : null,
            ])}
            key={key}
            style={{ height }}
          />
        );
      })}
    </div>
  );

  let button: React.ReactElement;
  if (state === State.Pending || state === State.Computing) {
    // Not really a button, but who cares?
    button = (
      <div
        className={classNames(
          `${CSS_BASE}__spinner`,
          `${CSS_BASE}__spinner--pending`
        )}
        title={i18n('MessageAudio--pending')}
      />
    );
  } else if (state === State.NotDownloaded) {
    button = (
      <Button
        i18n={i18n}
        buttonRef={buttonRef}
        mod="download"
        label="MessageAudio--download"
        onClick={kickOffAttachmentDownload}
      />
    );
  } else {
    // State.Normal
    button = (
      <Button
        i18n={i18n}
        buttonRef={buttonRef}
        mod={isPlaying ? 'pause' : 'play'}
        label={isPlaying ? 'MessageAudio--pause' : 'MessageAudio--play'}
        onClick={toggleIsPlaying}
      />
    );
  }

  const countDown = duration - currentTime;

  return (
    <div
      className={classNames(
        CSS_BASE,
        `${CSS_BASE}--${direction}`,
        withContentBelow ? `${CSS_BASE}--with-content-below` : null,
        withContentAbove ? `${CSS_BASE}--with-content-above` : null
      )}
    >
      {button}
      {waveform}
      <div className={`${CSS_BASE}__countdown`}>{timeToText(countDown)}</div>
    </div>
  );
};
