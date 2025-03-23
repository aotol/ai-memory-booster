import {
  jest
} from '@jest/globals';

jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn()
}));

jest.unstable_mockModule('../core/configManager.js', () => ({
  default: {
    isDebug: jest.fn()
  }
}));

describe('debug.js', () => {
  let fs;
  let debug;
  let configManager;

  beforeEach(async () => {
    fs = await import('fs');
    configManager = (await import('../core/configManager.js')).default;
    debug = await import('../core/debug.js');

    // mocks:
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
  });

  it('log() should write log when debug is enabled', async () => {
    configManager.isDebug.mockReturnValue(true);
    console.log = jest.fn();
    await debug.log('test log');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test log'));
  });

  it('log() should skip logging if debug is false', async () => {
    configManager.isDebug.mockReturnValue(false);
    console.log = jest.fn();
    await debug.log('test log');
    expect(console.log).not.toHaveBeenCalled();
  });
});