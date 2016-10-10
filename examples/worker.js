'use strict';

const Rekrow = require('../lib').default;
const id = Math.floor(Math.random() * 10);

const rekrow = new Rekrow({
  url: 'amqp://localhost',
  jobName: 'example',
  maxParallelJobCount: 1,
  handle(data) {
    console.log(id, data);
    return new Promise(r => {
      setTimeout(r, id * 1000);
    });
  }
});

rekrow.connect()
  .then(() => {
    console.log(`${id} is online`)
  });
