// Copyright 2015-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* global textsecure */

describe('MessageReceiver', () => {
  const { WebSocket } = window;
  const number = '+19999999999';
  const uuid = 'AAAAAAAA-BBBB-4CCC-9DDD-EEEEEEEEEEEE';
  const deviceId = 1;
  const signalingKey = window.Signal.Crypto.getRandomBytes(32 + 20);

  before(() => {
    localStorage.clear();
    window.WebSocket = MockSocket;
    textsecure.storage.user.setNumberAndDeviceId(number, deviceId, 'name');
    textsecure.storage.user.setUuidAndDeviceId(uuid, deviceId);
    textsecure.storage.put('password', 'password');
    textsecure.storage.put('signaling_key', signalingKey);
  });
  after(() => {
    localStorage.clear();
    window.WebSocket = WebSocket;
  });

  describe('connecting', () => {
    let attrs;
    let websocketmessage;

    before(() => {
      attrs = {
        type: textsecure.protobuf.Envelope.Type.CIPHERTEXT,
        source: number,
        sourceUuid: uuid,
        sourceDevice: deviceId,
        timestamp: Date.now(),
        content: window.Signal.Crypto.getRandomBytes(200),
      };
      const body = new textsecure.protobuf.Envelope(attrs).toArrayBuffer();

      websocketmessage = new textsecure.protobuf.WebSocketMessage({
        type: textsecure.protobuf.WebSocketMessage.Type.REQUEST,
        request: { verb: 'PUT', path: '/api/v1/message', body },
      });
    });

    it('generates decryption-error event when it cannot decrypt', done => {
      const mockServer = new MockServer('ws://localhost:8081/');

      mockServer.on('connection', server => {
        setTimeout(() => {
          server.send(new Blob([websocketmessage.toArrayBuffer()]));
        }, 1);
      });

      const messageReceiver = new textsecure.MessageReceiver(
        'oldUsername.2',
        'username.2',
        'password',
        'signalingKey',
        {
          serverTrustRoot: 'AAAAAAAA',
        }
      );

      messageReceiver.addEventListener('decrytion-error', done());
    });
  });

  // For when we start testing individual MessageReceiver methods

  // describe('methods', () => {
  //   let messageReceiver;
  //   let mockServer;

  //   beforeEach(() => {
  //     // Necessary to populate the server property inside of MockSocket. Without it, we
  //     //   crash when doing any number of things to a MockSocket instance.
  //     mockServer = new MockServer('ws://localhost:8081');

  //     messageReceiver = new textsecure.MessageReceiver(
  //       'oldUsername.3',
  //       'username.3',
  //       'password',
  //       'signalingKey',
  //       {
  //         serverTrustRoot: 'AAAAAAAA',
  //       }
  //     );
  //   });
  //   afterEach(() => {
  //     mockServer.close();
  //   });
  // });
});
