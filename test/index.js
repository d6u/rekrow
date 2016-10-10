'use strict';

const Rekrow = require('../lib').default;
const expect = require('expect');

it('receive enqueued job', (done) => {
  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test',
    handle(data) {
      expect(data).toEqual({name: 'test'});
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

  setTimeout(() => {
    r1.close();
    r2.close();
    done();
  }, 100);
});

it('redelive failed job', (done) => {
  let count = 0;

  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test',
    handle(data) {
      expect(data).toEqual({name: 'test'});
      count++;
      if (count === 1) {
        throw new Error('some error');
      }
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

  setTimeout(() => {
    r1.close();
    r2.close();
    done();
  }, 100);
});

it('honor maxParallelJobCount', (done) => {
  const r1 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test'
  });

  const r2 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test',
    maxParallelJobCount: 1,
    handle(data) {
      return new Promise(resolve => {
        expect(data).toEqual({name: 'test'});
        setTimeout(() => {
          resolve();
        }, 100);
      });
    }
  });

  const r3 = new Rekrow({
    url: 'amqp://localhost',
    jobName: 'test',
    maxParallelJobCount: 1,
    handle(data) {
      return new Promise(resolve => {
        expect(data).toEqual({name: 'test'});
        setTimeout(() => {
          resolve();
        }, 100);
      });
    }
  });

  Promise.all([r1.connect(), r2.connect(), r3.connect()])
    .then(() => {
      r1.enqueue({name: 'test'});
      r1.enqueue({name: 'test'});
    });

  setTimeout(() => {
    r1.close();
    r2.close();
    r3.close();
    done();
  }, 200);
});
