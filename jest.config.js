export default {
    testEnvironment: 'node',
    transform: {},
    moduleFileExtensions: ['js', 'json'],
    collectCoverage: true,
    testTimeout: 15000,
    collectCoverageFrom: [
      "**/*.js",
      "!**/node_modules/**",
      "!**/logs/**",
      "!**/archives/**",
      "!**/config.json",
      "!**/jest.config.js",
      "!**/web/**" 
    ],
    coverageReporters: ["text", "lcov"]
  };