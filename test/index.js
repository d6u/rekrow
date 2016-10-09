'use strict';

const test = require('tape');
const Rekrow = require('../lib').default;

test('receive enqueued job', (t) => {
  t.plan(1);

  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test1',
    handle(data) {
      t.deepEqual(data, {name: 'test'});
    }
  });

  const r2 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test1'
  });

  r1.connect();

  r2.connect()
    .then(() => {
      r2.enqueue({name: 'test'});
    });

  setTimeout(() => {
    r1.close();
    r2.close();
  }, 100);
});

test('redelive failed job', (t) => {
  t.plan(2);

  let count = 0;

  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test2',
    handle(data) {
      t.deepEqual(data, {name: 'test'});
      count++;
      if (count === 1) {
        throw new Error('some error');
      }
    }
  });

  const r2 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test2'
  });

  r1.connect();

  r2.connect()
    .then(() => {
      r2.enqueue({name: 'test'});
    });

  setTimeout(() => {
    r1.close();
    r2.close();
  }, 100);
});
