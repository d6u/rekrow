'use strict';

const test = require('tape');
const Rekrow = require('../lib').default;

test('receive enqueued job', (t) => {
  t.plan(1);

  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test',
    handle(data) {
      t.deepEqual(data, {name: 'test'});
      r1.close();
      r2.close();
    }
  });

  const r2 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test'
  });

  Promise.all([r1.connect(), r2.connect()])
    .then(() => {
      r2.enqueue({name: 'test'});
    });
});

test('redelive failed job', (t) => {
  t.plan(2);

  let count = 0;

  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test',
    handle(data) {
      t.deepEqual(data, {name: 'test'});
      count++;
      if (count === 1) {
        throw new Error('some error');
      }
      r1.close();
      r2.close();
    }
  });

  const r2 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test'
  });

  Promise.all([r1.connect(), r2.connect()])
    .then(() => {
      r2.enqueue({name: 'test'});
    });
});
