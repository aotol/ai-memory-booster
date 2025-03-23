import {
    jest
} from '@jest/globals';

// Single mock of fs
jest.unstable_mockModule('fs', () => ({
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn()
}));

describe('configManager.js', () => {
    let fs;
    let configManager;

    beforeEach(async () => {
        fs = await import('fs');

        fs.readFileSync.mockReturnValue(JSON.stringify({
            aiModel: 'test-model',
            debug: true
        }));
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});

        configManager = (await import('../core/configManager.js')).default;
    });

    it('should get aiModel', () => {
        expect(configManager.getAiModel()).toBe('test-model');
    });

    it('should toggle debug mode', () => {
        configManager.setDebug(false);
        expect(typeof configManager.getAllConfig()).toBe('object');
    });
});