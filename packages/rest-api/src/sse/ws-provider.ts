import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ethers } from 'ethers';
import * as WebSocket from 'ws';

interface Config {
  KEEP_ALIVE_CHECK_INTERVAL: number;
  RPC_URL: string;
}

export class WsProvider {
  provider: ethers.providers.WebSocketProvider;
  KEEP_ALIVE_CHECK_INTERVAL: number;
  keepAliveInterval: NodeJS.Timer;

  config: Config;
  eventEmitter: EventEmitter2;

  defWsOpen: (event: any) => void;
  defWsClose: (event: any) => void;
  /**
   * Constructs the class
   */
  constructor(
    { KEEP_ALIVE_CHECK_INTERVAL, RPC_URL }: Config,
    eventEmitter: EventEmitter2,
  ) {
    this.config = { KEEP_ALIVE_CHECK_INTERVAL, RPC_URL };
    this.load(this.config);
    this.eventEmitter = eventEmitter;
  }

  /**
   * Load assets.
   * @param {Object} config Config object.
   */
  load(config: Config) {
    this.KEEP_ALIVE_CHECK_INTERVAL = config.KEEP_ALIVE_CHECK_INTERVAL;
    this.provider = new ethers.providers.WebSocketProvider(config.RPC_URL);
    this.defWsOpen = this.provider._websocket.onopen;
    this.defWsClose = this.provider._websocket.onclose;

    this.provider._websocket.onopen = (event) => this.onWsOpen(event);
    this.provider._websocket.onclose = (event) => this.onWsClose(event);
  }

  /**
   * Check class is loaded.
   * @returns Bool
   */
  isLoaded() {
    if (!this.provider) return false;
    return true;
  }

  /**
   * Triggered when provider's websocket is open.
   */
  onWsOpen(event) {
    Logger.log('Connected to the WS!');
    this.keepAliveInterval = setInterval(() => {
      if (
        this.provider._websocket.readyState === WebSocket.OPEN ||
        this.provider._websocket.readyState === WebSocket.CONNECTING
      )
        return;

      this.provider._websocket.close();
    }, this.KEEP_ALIVE_CHECK_INTERVAL);

    if (this.defWsOpen) this.defWsOpen(event);
  }

  /**
   * Triggered on websocket termination.
   * Tries to reconnect again.
   */
  onWsClose(event) {
    Logger.log('WS connection lost! Reconnecting...');
    clearInterval(this.keepAliveInterval);
    this.load(this.config);
    this.eventEmitter.emit('ws.closed');

    if (this.defWsClose) this.defWsClose(event);
  }
}
