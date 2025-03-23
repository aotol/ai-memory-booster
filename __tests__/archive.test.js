import {
  jest
} from '@jest/globals';

// Mock both fs and configManager before import
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn()
}));

jest.unstable_mockModule('path', () => ({
  join: jest.fn(() => './archives/test.json'),
  dirname: jest.fn(() => './')
}));

jest.unstable_mockModule('../core/configManager.js', () => ({
  default: {
    isDebug: jest.fn()
  }
}));

describe('archive.js', () => {
  let archive;
  let fs;
  let configManager;

  beforeEach(async () => {
    fs = await import('fs');
    configManager = (await import('../core/configManager.js')).default;
    archive = await import('../core/archive.js');

    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    fs.readFileSync.mockReturnValue('{"id":1}');
    configManager.isDebug.mockReturnValue(true);
  });

  it('archiveToFile() should create archive', () => {
    archive.archiveToFile({
      id: 'test',
      summary: 'summary'
    });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('getArchivedMemory() should read archive', async () => {
    fs.existsSync.mockReturnValue(true);
    const result = await archive.getArchivedMemory('test');
    expect(result).toEqual({
      id: 1
    });
  });
});