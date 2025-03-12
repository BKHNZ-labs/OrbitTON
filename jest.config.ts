import type { Config } from 'jest';

const config: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

export default config;
