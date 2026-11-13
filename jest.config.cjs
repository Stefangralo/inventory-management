module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.ts'],
  testMatch: ['**/test/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          isolatedModules: true,
        },
      },
    ],
  },
  testTimeout: 30000,
};
