'use strict';

const Rekrow = require('../lib').default;

const rekrow = new Rekrow({
  url: 'amqp://localhost',
  jobName: 'example'
});

rekrow.connect()
  .then(() => {
    rekrow.enqueue({data: 1});
    rekrow.enqueue({data: 2});
    rekrow.enqueue({data: 3});
    rekrow.enqueue({data: 4});
  });
