import {
  sortConversationSet,
  cosineSimilarity,
  normalizeAndTruncate,
  weightedTruncate,
  averagePoolingTruncate,
  extractNumber
} from '../core/util.js';

describe('util.js pure functions', () => {

  describe('sortConversationSet', () => {
    it('should sort by userMessageWeight and then by timestamp', () => {
      const set = new Set([{
          userMessageWeight: 5,
          timestamp: 3
        },
        {
          userMessageWeight: 5,
          timestamp: 1
        },
        {
          userMessageWeight: 2,
          timestamp: 2
        }
      ]);

      const sorted = sortConversationSet(set);
      expect(sorted).toEqual([{
          userMessageWeight: 2,
          timestamp: 2
        },
        {
          userMessageWeight: 5,
          timestamp: 1
        },
        {
          userMessageWeight: 5,
          timestamp: 3
        }
      ]);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vecA = [1, 0];
      const vecB = [1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0);
    });
  });

  describe('normalizeAndTruncate', () => {
    it('should normalize and truncate vector', () => {
      const vec = [3, 4, 0];
      const result = normalizeAndTruncate(vec, 2);
      // Should return a normalized vector truncated to 2 dimensions
      const norm = Math.sqrt(3 * 3 + 4 * 4 + 0 * 0);
      expect(result.length).toBe(2);
      expect(result).toEqual([
        3 / norm,
        4 / norm
      ]);
    });

    it('should handle zero norm gracefully', () => {
      const vec = [0, 0, 0];
      const result = normalizeAndTruncate(vec, 2);
      expect(result).toEqual([0, 0]);
    });
  });

  describe('weightedTruncate', () => {
    it('should take start and end slices', () => {
      const vec = Array.from({
        length: 10
      }, (_, i) => i + 1);
      const truncated = weightedTruncate(vec, 4);
      expect(truncated).toEqual([1, 2, 9, 10]);
    });
  });

  describe('averagePoolingTruncate', () => {
    it('should average pool vector', () => {
      const vec = Array.from({
        length: 8
      }, (_, i) => i + 1); // [1,2,3,4,5,6,7,8]
      const pooled = averagePoolingTruncate(vec, 4); // Should create 4 groups of 2
      expect(pooled).toEqual([
        (1 + 2) / 2,
        (3 + 4) / 2,
        (5 + 6) / 2,
        (7 + 8) / 2
      ]);
    });
  });

  describe('extractNumber', () => {
    it('should extract the first number from a string', () => {
      expect(extractNumber('abc123def')).toBe(123);
      expect(extractNumber('no number')).toBeNaN();
      expect(extractNumber('456 is first but 789 later')).toBe(456);
    });
  });

});