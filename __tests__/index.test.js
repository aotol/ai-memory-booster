// index.test.js
import index from '../core/index.js';

describe('index.js', () => {
  it('should export memory methods', () => {
    expect(index.storeMemory).toBeDefined();
    expect(index.retrieveMemory).toBeDefined();
    expect(index.forget).toBeDefined();
    expect(index.chat).toBeDefined();
    expect(index.generate).toBeDefined();
  });

  it('should export configManager', () => {
    expect(index.configManager).toBeDefined();
  });
});