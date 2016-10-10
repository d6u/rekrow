# rekrow

Robust distributed worker queue using RabbitMQ to end all the headache

## Install

```
npm i -S rekrow
```

## Usage

**Dispatcher**

```js
const Rekrow = require('rekrow').default;

const rekrow = new Rekrow({
  url: 'amqp://localhost',
  jobName: 'example'
});

rekrow.connect()
  .then(() => {
    rekrow.enqueue({data: 1});
  });
```

**Worker**

```js
const Rekrow = require('rekrow').default;

const rekrow = new Rekrow({
  url: 'amqp://localhost',
  jobName: 'example',
  handle(data) {
    console.log(data);
  }
});

rekrow.connect();
```

## API

### `new Rekrow(opts)`

Create a new Rekrow instance

- `opts.url`:
- `opts.jobName`:
- `opts.handle: (data: Object) => Promise<any>`: (optional) specify this handle when you want to handle incoming jobs.
- `opts.maxParallelJobCount: number`: (optional) how many job to process at the same time. Default to no limit.
- `opts.maxRetryCount: number`: (optional) how many time a fail job should be retried, e.g. `4` means the job will be processed in a total of 5 times (retried 4 times), before it is dicarded. Default to 0.
- `opts.retryWaitTime: number`: (optional) how many milliseconds a job should wait before re-queued for retry. Default to 5000.

### `rekrow.connect(): Promise<void>`

`connect` much be called before doing anything.

### `rekrow.enqueue(data: Object): boolean`

### `rekrow.close(): Promise<void>`

Gracefully close connection to RabbitMQ. Will wait for any all running job to finish. But it will stop accepting new jobs.
