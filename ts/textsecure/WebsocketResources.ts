// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable max-classes-per-file */
/*
 * WebSocket-Resources
 *
 * Create a request-response interface over websockets using the
 * WebSocket-Resources sub-protocol[1].
 *
 * var client = new WebSocketResource(socket, function(request) {
 *    request.respond(200, 'OK');
 * });
 *
 * client.sendRequest({
 *    verb: 'PUT',
 *    path: '/v1/messages',
 *    body: '{ some: "json" }',
 *    success: function(message, status, request) {...},
 *    error: function(message, status, request) {...}
 * });
 *
 * 1. https://github.com/signalapp/WebSocket-Resources
 *
 */

import { connection as WebSocket, IMessage } from 'websocket';

import { ByteBufferClass } from '../window.d';
import { typedArrayToArrayBuffer as toArrayBuffer } from '../Crypto';

import EventTarget from './EventTarget';

import { isOlderThan } from '../util/timestamp';

class Request {
  verb: string;

  path: string;

  headers: Array<string>;

  body: ByteBufferClass | null;

  success: Function;

  error: Function;

  id: number;

  response?: any;

  constructor(options: any) {
    this.verb = options.verb || options.type;
    this.path = options.path || options.url;
    this.headers = options.headers;
    this.body = options.body || options.data;
    this.success = options.success;
    this.error = options.error;
    this.id = options.id;

    if (this.id === undefined) {
      const bits = new Uint32Array(2);
      window.crypto.getRandomValues(bits);
      this.id = window.dcodeIO.Long.fromBits(bits[0], bits[1], true);
    }

    if (this.body === undefined) {
      this.body = null;
    }
  }
}

export class IncomingWebSocketRequest {
  verb: string;

  path: string;

  body: ByteBufferClass | null;

  headers: Array<string>;

  respond: (status: number, message: string) => void;

  constructor(options: unknown) {
    const request = new Request(options);
    const { socket } = options as { socket: WebSocket };

    this.verb = request.verb;
    this.path = request.path;
    this.body = request.body;
    this.headers = request.headers;

    this.respond = (status, message) => {
      const ab = new window.textsecure.protobuf.WebSocketMessage({
        type: window.textsecure.protobuf.WebSocketMessage.Type.RESPONSE,
        response: { id: request.id, message, status },
      })
        .encode()
        .toArrayBuffer();
      socket.sendBytes(Buffer.from(ab));
    };
  }
}

const outgoing: {
  [id: number]: Request;
} = {};
class OutgoingWebSocketRequest {
  constructor(options: any, socket: WebSocket) {
    const request = new Request(options);
    outgoing[request.id] = request;
    const ab = new window.textsecure.protobuf.WebSocketMessage({
      type: window.textsecure.protobuf.WebSocketMessage.Type.REQUEST,
      request: {
        verb: request.verb,
        path: request.path,
        body: request.body,
        headers: request.headers,
        id: request.id,
      },
    })
      .encode()
      .toArrayBuffer();
    socket.sendBytes(Buffer.from(ab));
  }
}

export default class WebSocketResource extends EventTarget {
  closed?: boolean;

  close: (code?: number, reason?: string) => void;

  sendRequest: (options: any) => OutgoingWebSocketRequest;

  keepalive?: KeepAlive;

  constructor(socket: WebSocket, opts: any = {}) {
    super();

    let { handleRequest } = opts;
    if (typeof handleRequest !== 'function') {
      handleRequest = (request: IncomingWebSocketRequest) => {
        request.respond(404, 'Not found');
      };
    }
    this.sendRequest = options => new OutgoingWebSocketRequest(options, socket);

    // eslint-disable-next-line no-param-reassign
    const onMessage = ({ type, binaryData }: IMessage): void => {
      if (type !== 'binary' || !binaryData) {
        throw new Error(`Unsupported websocket message type: ${type}`);
      }

      const message = window.textsecure.protobuf.WebSocketMessage.decode(
        toArrayBuffer(binaryData)
      );
      if (
        message.type ===
          window.textsecure.protobuf.WebSocketMessage.Type.REQUEST &&
        message.request
      ) {
        handleRequest(
          new IncomingWebSocketRequest({
            verb: message.request.verb,
            path: message.request.path,
            body: message.request.body,
            headers: message.request.headers,
            id: message.request.id,
            socket,
          })
        );
      } else if (
        message.type ===
          window.textsecure.protobuf.WebSocketMessage.Type.RESPONSE &&
        message.response
      ) {
        const { response } = message;
        const request = outgoing[response.id];
        if (request) {
          request.response = response;
          let callback = request.error;
          if (
            response.status &&
            response.status >= 200 &&
            response.status < 300
          ) {
            callback = request.success;
          }

          if (typeof callback === 'function') {
            callback(response.message, response.status, request);
          }
        } else {
          throw new Error(
            `Received response for unknown request ${message.response.id}`
          );
        }
      }
    };
    socket.on('message', onMessage);

    if (opts.keepalive) {
      this.keepalive = new KeepAlive(this, {
        path: opts.keepalive.path,
        disconnect: opts.keepalive.disconnect,
      });
      const resetKeepAliveTimer = this.keepalive.reset.bind(this.keepalive);

      this.keepalive.reset();

      socket.on('message', resetKeepAliveTimer);
      socket.on('close', this.keepalive.stop.bind(this.keepalive));
    }

    socket.on('close', () => {
      this.closed = true;
    });

    this.close = (code = 3000, reason) => {
      if (this.closed) {
        return;
      }

      window.log.info('WebSocketResource.close()');
      if (this.keepalive) {
        this.keepalive.stop();
      }

      socket.close(code, reason);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      socket.removeListener('message', onMessage);

      // On linux the socket can wait a long time to emit its close event if we've
      //   lost the internet connection. On the order of minutes. This speeds that
      //   process up.
      setTimeout(() => {
        if (this.closed) {
          return;
        }
        this.closed = true;

        window.log.warn('Dispatching our own socket close event');
        const ev = new Event('close');
        ev.code = code;
        ev.reason = reason;
        this.dispatchEvent(ev);
      }, 5000);
    };
  }

  public forceKeepAlive(): void {
    if (!this.keepalive) {
      return;
    }
    this.keepalive.send();
  }
}

type KeepAliveOptionsType = {
  path?: string;
  disconnect?: boolean;
};

const KEEPALIVE_INTERVAL_MS = 55000; // 55 seconds + 5 seconds for closing the
// socket above.
const MAX_KEEPALIVE_INTERVAL_MS = 300 * 1000; // 5 minutes

class KeepAlive {
  private keepAliveTimer: NodeJS.Timeout | undefined;

  private disconnectTimer: NodeJS.Timeout | undefined;

  private path: string;

  private disconnect: boolean;

  private wsr: WebSocketResource;

  private lastAliveAt: number = Date.now();

  constructor(
    websocketResource: WebSocketResource,
    opts: KeepAliveOptionsType = {}
  ) {
    if (websocketResource instanceof WebSocketResource) {
      this.path = opts.path !== undefined ? opts.path : '/';
      this.disconnect = opts.disconnect !== undefined ? opts.disconnect : true;
      this.wsr = websocketResource;
    } else {
      throw new TypeError('KeepAlive expected a WebSocketResource');
    }
  }

  public stop(): void {
    this.clearTimers();
  }

  public send(): void {
    this.clearTimers();

    if (isOlderThan(this.lastAliveAt, MAX_KEEPALIVE_INTERVAL_MS)) {
      window.log.info('WebSocketResources: disconnecting due to stale state');
      this.wsr.close(
        3001,
        `Last keepalive request was too far in the past: ${this.lastAliveAt}`
      );
      return;
    }

    if (this.disconnect) {
      // automatically disconnect if server doesn't ack
      this.disconnectTimer = setTimeout(() => {
        window.log.info('WebSocketResources: disconnecting due to no response');
        this.clearTimers();

        this.wsr.close(3001, 'No response to keepalive request');
      }, 10000);
    } else {
      this.reset();
    }

    window.log.info('WebSocketResources: Sending a keepalive message');
    this.wsr.sendRequest({
      verb: 'GET',
      path: this.path,
      success: this.reset.bind(this),
    });
  }

  public reset(): void {
    this.lastAliveAt = Date.now();

    this.clearTimers();

    this.keepAliveTimer = setTimeout(() => this.send(), KEEPALIVE_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = undefined;
    }
  }
}
