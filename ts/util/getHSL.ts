// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

const LIGHTNESS_TABLE: Record<number, number> = {
  0: 45,
  60: 30,
  180: 30,
  240: 50,
  300: 40,
  360: 45,
};

function getLightnessFromHue(hue: number, min: number, max: number) {
  const percentage = ((hue - min) * 100) / (max - min);
  const minValue = LIGHTNESS_TABLE[min];
  const maxValue = LIGHTNESS_TABLE[max];

  return (percentage * (maxValue - minValue)) / 100 + minValue;
}

function calculateLightness(hue: number): number {
  let lightness = 45;
  if (hue < 60) {
    lightness = getLightnessFromHue(hue, 0, 60);
  } else if (hue < 180) {
    lightness = 30;
  } else if (hue < 240) {
    lightness = getLightnessFromHue(hue, 180, 240);
  } else if (hue < 300) {
    lightness = getLightnessFromHue(hue, 240, 300);
  } else {
    lightness = getLightnessFromHue(hue, 300, 360);
  }

  return lightness;
}

function adjustLightnessValue(
  lightness: number,
  percentIncrease: number
): number {
  return lightness + lightness * percentIncrease;
}

export function getHSL(
  {
    hue,
    saturation,
  }: {
    hue: number;
    saturation: number;
  },
  adjustedLightness = 0
): string {
  return `hsl(${hue}, ${saturation}%, ${adjustLightnessValue(
    calculateLightness(hue),
    adjustedLightness
  )}%)`;
}
