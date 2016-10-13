import * as amqp from 'amqplib';
import settlePromise from './settlePromise';

export default class Rekrow {
  private externalResources: RekrowExternalResources | null = null;
  private pendingConnect: Promise<void> | null = null;
  private pendingOperations = new Set<Promise<void>>();
  private isClosing = false;

  private readonly url: string;
  private readonly socketOptions?: Object;
  private readonly jobName: string;
  private readonly handle: ((data: Object) => Promise<void>) | null;
  private readonly maxParallelJobCount: number | null;
  private readonly maxRetryCount: number;
  private readonly retryWaitTime: number;
  private readonly exchangeName: string;
  private readonly queueName: string;
  private readonly retryExchangeName: string;
  private readonly retryQueueName: string;

  constructor(opts: RekrowOptions) {
    this.url = opts.connection.url;
    this.socketOptions = opts.connection.socketOptions;
    this.jobName = opts.jobName;
    this.handle = opts.handle || null;
    this.maxParallelJobCount = opts.maxParallelJobCount || null;
    this.maxRetryCount = opts.maxRetryCount || 0;
    this.retryWaitTime = opts.retryWaitTime || 5000;

    this.exchangeName = `${opts.jobName}_exchange`;
    this.queueName = `${opts.jobName}_queue`;
    this.retryExchangeName = `${opts.jobName}_retry_exchange`;
    this.retryQueueName = `${opts.jobName}_retry_queue`;
  }

  connect() {
    if (this.pendingConnect) {
      return this.pendingConnect;
    }
    if (this.externalResources) {
      return Promise.resolve();
    }
    this.pendingConnect = this.setup();
    return this.pendingConnect;
  }

  async close() {
    if (!this.externalResources) {
      return;
    }
    this.isClosing = true;
    if (this.externalResources.consumerTag) {
      await this.externalResources.ch.cancel(this.externalResources.consumerTag);
    }
    await settlePromise(this.pendingOperations);
    await this.externalResources.conn.close();
    this.externalResources = null;
    this.isClosing = false;
  }

  async enqueue(data: Object): Promise<boolean> {
    if (this.isClosing) {
      throw new Error('cannot enqueue new job when closing');
    }
    if (!this.externalResources) {
      throw new Error('"connect" must be called first before enqueue any job');
    }
    return this.publish(new Buffer(JSON.stringify(data)));
  }

  private async setup() {
    // Setup connection and channel
    //

    const conn = await amqp.connect(
      this.url,
      Object.assign({heartbeat: 1}, this.socketOptions)
    );
    const ch = await conn.createChannel();

    // Create worker queue
    //

    await ch.assertExchange(this.exchangeName, 'topic', {durable: true});
    await ch.assertQueue(this.queueName, {durable: true});
    await ch.bindQueue(this.queueName, this.exchangeName, '');

    // Create retry waiting queue
    //

    await ch.assertExchange(this.retryExchangeName, 'topic', {durable: true});
    await ch.assertQueue(this.retryQueueName, {
      durable: true,
      messageTtl: this.retryWaitTime,
      deadLetterExchange: this.exchangeName
    });
    await ch.bindQueue(this.retryQueueName, this.retryExchangeName, '');

    // Setup consumer
    //

    let consumerTag: string | null = null;

    if (this.handle) {
      if (this.maxParallelJobCount) {
        await ch.prefetch(this.maxParallelJobCount);
      }

      const consumer = await ch.consume(this.queueName, msg => {
        const promise = this.consume(msg)
          .then(() => {
            this.pendingOperations.delete(promise);
          })
          .catch(err => {
            this.pendingOperations.delete(promise);
            throw err;
          });
        this.pendingOperations.add(promise);
      });

      consumerTag = consumer.consumerTag;
    }

    // Save references to external resources
    //

    this.externalResources = consumerTag ? {conn, ch, consumerTag} : {conn, ch};
  }

  private async consume(msg: amqp.Message) {
    const data = JSON.parse(msg.content.toString());
    try {
      // Wrap with "resolve" in case handle doesn't return promise
      await Promise.resolve(this.handle!(data));
      await this.externalResources!.ch.ack(msg);
    } catch (err) {
      if (this.maxRetryCount) {
        const currentCount = parseInt(msg.properties.headers['x-retry-count']);
        if (currentCount <= this.maxRetryCount) {
          this.publish(msg.content, true, currentCount + 1);
        }
      }
      await this.externalResources!.ch.nack(msg, false, false);
    }
  }

  private publish(content: Buffer, isRetry: boolean = false, currentRetryCount: number = 0) {
    return this.externalResources!.ch.publish(
      isRetry ? this.retryExchangeName : this.exchangeName,
      '',
      content,
      {
        persistent: true,
        headers: {
          'x-retry-count': currentRetryCount
        }
      }
    );
  }
}

export interface RekrowOptions {
  connection: {
    url: string;
    socketOptions?: Object;
  };
  jobName: string;
  maxParallelJobCount?: number;
  maxRetryCount?: number;
  retryWaitTime?: number;
  handle?: (data: Object) => Promise<void>;
}

interface RekrowExternalResources {
  conn: amqp.Connection;
  ch: amqp.Channel;
  consumerTag?: string;
}
