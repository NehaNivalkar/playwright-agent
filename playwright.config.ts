import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    headless: false,
    baseURL: 'https://the-internet.herokuapp.com',
    screenshot: 'only-on-failure',
  },
});
