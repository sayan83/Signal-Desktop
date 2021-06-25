// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable no-console */

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const ByteBuffer = require('../components/bytebuffer/dist/ByteBufferAB.js');
const Long = require('../components/long/dist/Long.js');
const { setEnvironment, Environment } = require('../ts/environment');
const { Context: SignalContext } = require('../ts/context');
const { isValidGuid } = require('../ts/util/isValidGuid');

chai.use(chaiAsPromised);

setEnvironment(Environment.Test);

const storageMap = new Map();

// To replicate logic we have on the client side
global.window = {
  SignalContext: new SignalContext(),
  log: {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  },
  i18n: key => `i18n(${key})`,
  dcodeIO: {
    ByteBuffer,
    Long,
  },
  storage: {
    get: key => storageMap.get(key),
    put: async (key, value) => storageMap.set(key, value),
  },
  isValidGuid,
};

// For ducks/network.getEmptyState()
global.navigator = {};
global.WebSocket = {};
