import configManager from "./configManager.js";
import {ollamaEmbeddings} from "./llm.js";
export function sortCoversationSet(conversationSet) {
    let sortedConversations = [...conversationSet].sort((a, b) => {
        // First, sort by weight (ascending: less weight at the top)
        if (a.weight !== b.weight) {
            return a.weight - b.weight; 
        }
        // If weight is the same, sort by timestamp (ascending: older on top)
        return a.timestamp - b.timestamp;
    });
    return sortedConversations;
}

/** Merge memories into one memories */
export async function mergeMemories(conversationSet) {
    let mergedMemory = {};
    if (conversationSet && conversationSet.length > 0) {
        // Sort conversations from oldest to latest and weight
        let sortedConversations = sortCoversationSet(conversationSet);

        // Deduplicate messages before merging
        let uniqueUserMessages = [...new Set(sortedConversations.map(conv => conv.userMessage))];
        let uniqueAiMessages = [...new Set(sortedConversations.map(conv => conv.aiMessage))];
        let uniqueSummaries = [...new Set(sortedConversations.map(conv => conv.summary))];

        let contradictionMessages = new Set();
        for (let i = 0; i < uniqueUserMessages.length; i++) {
            for (let j = i + 1; j < uniqueUserMessages.length; j++) {
                if (await detectContradiction(uniqueUserMessages[i], uniqueUserMessages[j])) {
                    contradictionMessages.add(uniqueUserMessages[i]);
                    contradictionMessages.add(uniqueUserMessages[j]);
                }
            }
        }
        let latestConversation = sortedConversations[sortedConversations.length - 1];
        if (contradictionMessages.size > 0) {
            mergedMemory =  {
                summary: latestConversation.summary,
                userMessage: uniqueUserMessages.join(" / OR / "),
                aiMessage: uniqueAiMessages.join(" / OR / ")
            };
        } else {
            // Use summarization instead of simple concatenation
            let mergedUserMessage = summarizeMessages(uniqueUserMessages);
            let mergedAiMessage = summarizeMessages(uniqueAiMessages);
            let mergedSummary = summarizeMessages(uniqueSummaries);

            mergedMemory =  {
                summary: mergedSummary.trim(),
                userMessage: mergedUserMessage.trim(),
                aiMessage: mergedAiMessage.trim()
            };
        }
    }
    return mergedMemory;
}

export function summarizeMessages(messages = []) {
    let summarizedMessage = "";
    summarizedMessage = messages.join(". ").trim();
    return summarizedMessage;
}

export function adjustVectorSize(queryVector) {
    return configManager.getDimension() != queryVector.length ?normalizeAndTruncate(queryVector, configManager.getDimension()) : queryVector;
}

/**
 * Computes cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Detects contradictions between two messages using embeddings.
 */
export async function detectContradiction(msg1, msg2) {
    const embedding1 = await ollamaEmbeddings.embedQuery(msg1);
    const embedding2 = await ollamaEmbeddings.embedQuery(msg2);

    const similarity = cosineSimilarity(embedding1, embedding2);

    // If similarity is low (<0.4), assume a contradiction exists
    return similarity < 0.4;
}

/**
 * Calculates weight dynamically for both userMessage and aiMessage.
 */
export async function calculateConversationWeight(userMessage, aiMessage, conversationSet = new Set()) {
    function calculateBaseWeight(message) {
        let weight = 50; // Base weight

        // Strong negations increase weight
        if (/\b(never|must not|don’t|do not|forbidden|should not|prohibited)\b/i.test(message)) {
            weight += 50;
        }

        // Uncertainty reduces weight
        if (/\b(don’t\s+know|do\s+not\s+know|not sure|uncertain|probably|maybe)\b/i.test(message)) {
            weight -= 20;
        }

        return weight;
    }

    async function adjustWeightForContradictions(message, conversationKey) {
        let adjustedWeight = calculateBaseWeight(message);
        
        for (const conversation of conversationSet) {
            if (await detectContradiction(message, conversation[conversationKey])) {
                adjustedWeight += 30; // Prioritize new message
            }
        }
        return adjustedWeight;
    }

    // Process both userMessage and aiMessage in parallel
    const [userMessageWeight, aiMessageWeight] = await Promise.all([
        adjustWeightForContradictions(userMessage, "userMessage"),
        adjustWeightForContradictions(aiMessage, "aiMessage")
    ]);

    return { userMessageWeight, aiMessageWeight };
}

/**
 * Preserves relative vector values. Loses dimensions
 * @param {*} embedding 
 * @param {*} targetDimension 
 * @returns 
 */
export function normalizeAndTruncate(embedding, targetDimension) {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) return embedding.slice(0, targetDimension); // Prevent division by zero

    const normalizedEmbedding = embedding.map(val => val / norm);
    return normalizedEmbedding.slice(0, targetDimension);
}

/**
 * Captures info from start & end. Arbitrary splitting.
 * @param {*} embedding 
 * @param {*} targetDimension 
 * @returns 
 */
export function weightedTruncate(embedding, targetDimension = 256) {
    const halfDim = Math.floor(targetDimension / 2);
    return embedding.slice(0, halfDim).concat(embedding.slice(-halfDim));
}

/**
 * Keeps overall vector structure. Slight loss of granularity
 * @param {*} embedding 
 * @param {*} targetDimension 
 * @returns 
 */
export function averagePoolingTruncate(embedding, targetDimension = 256) {
    const factor = Math.floor(embedding.length / targetDimension);
    
    return Array.from({ length: targetDimension }, (_, i) =>
        embedding.slice(i * factor, (i + 1) * factor).reduce((sum, val) => sum + val, 0) / factor
    );
}