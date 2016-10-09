import * as amqp from 'amqplib';

export default class Rekrow {
  private conn: amqp.Connection | null = null;
  private ch: amqp.Channel | null = null;
  private readonly exchangeName: string;
  private readonly queueName: string;

  constructor(private readonly opts: RekrowOptions) {
    this.exchangeName = `${opts.jobName}_exchange`;
    this.queueName = `${opts.jobName}_queue`;
  }

  async connect() {
    this.conn = await amqp.connect(this.opts.url, {
      heartbeat: 1
    });
    this.ch = await this.conn.createChannel();
    await this.ch.assertExchange(this.exchangeName, 'topic', {
      durable: true
    });
    await this.ch.assertQueue(this.queueName, {
      durable: true
    });
    await this.ch.bindQueue(this.queueName, this.exchangeName, '');

    if (this.opts.handle) {
      await this.ch.prefetch(1);

      await this.ch.consume(this.queueName, async (msg) => {
        const data = JSON.parse(msg.content.toString());
        try {
          // Wrap with "resolve" in case handle doesn't return promise
          await Promise.resolve(this.opts.handle!(data));
          await this.ch!.ack(msg);
        } catch (err) {
          await this.ch!.nack(msg, false, true);
        }
      });
    }
  }

  async close() {
    await this.conn!.close();
    this.conn = null;
    this.ch = null;
  }

  async enqueue(data: Object): Promise<boolean> {
    if (!this.conn) {
      throw new Error('"connect" must be called first before enqueue any job');
    }

    return await this.ch!.publish(
      this.exchangeName,
      '',
      new Buffer(JSON.stringify(data)),
      {persistent: true});
  }
}

export interface RekrowOptions {
  url: string;
  jobName: string;
  handle?: (data: Object) => Promise<void>;
}
