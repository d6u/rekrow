import * as amqp from 'amqplib';
import settlePromise from './settlePromise';

export default class Rekrow {
  private externalResources: RekrowExternalResources | null = null;
  private pendingConnect: Promise<void> | null = null;
  private pendingOperations = new Set<Promise<void>>();
  private isClosing = false;
  private readonly exchangeName: string;
  private readonly queueName: string;

  constructor(private readonly opts: RekrowOptions) {
    this.exchangeName = `${opts.jobName}_exchange`;
    this.queueName = `${opts.jobName}_queue`;
  }

  connect() {
    if (this.pendingConnect) {
      return this.pendingConnect;
    }
    if (this.externalResources) {
      return Promise.resolve();
    }
    this.pendingConnect = this.createConnection();
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

    return this.externalResources.ch.publish(
      this.exchangeName,
      '',
      new Buffer(JSON.stringify(data)),
      {persistent: true});
  }

  private async createConnection() {
    const conn = await amqp.connect(this.opts.url, {
      heartbeat: 1
    });
    const ch = await conn.createChannel();
    await ch.assertExchange(this.exchangeName, 'topic', {
      durable: true
    });
    await ch.assertQueue(this.queueName, {
      durable: true
    });
    await ch.bindQueue(this.queueName, this.exchangeName, '');

    let consumerTag: string | null = null;

    if (this.opts.handle) {
      if (this.opts.parallelJobCount) {
        await ch.prefetch(this.opts.parallelJobCount);
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

    this.externalResources = consumerTag ? {conn, ch, consumerTag} : {conn, ch};
  }

  private async consume(msg: amqp.Message) {
    const data = JSON.parse(msg.content.toString());
    try {
      // Wrap with "resolve" in case handle doesn't return promise
      await Promise.resolve(this.opts.handle!(data));
      await this.externalResources!.ch.ack(msg);
    } catch (err) {
      await this.externalResources!.ch.nack(msg, false, true);
    }
  }
}

export interface RekrowOptions {
  url: string;
  jobName: string;
  handle?: (data: Object) => Promise<void>;
  parallelJobCount?: number;
}

interface RekrowExternalResources {
  conn: amqp.Connection;
  ch: amqp.Channel;
  consumerTag?: string;
}
