import { config } from './config';
import { createApp } from './api/app';
import { startScheduler } from './scheduler';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Job Monitor backend listening on port ${config.port}`);
  startScheduler();
});
