import configManager from "./configManager.js";
import {ollamaEmbeddings} from "./llm.js";

export let messageSeparator = " | ";
/**
 * Sort conversations via weight and timestamp (ascending), return as array
 */
export function sortConversationSet(conversationSet) {
    return [...conversationSet].sort((a, b) => 
        a.userMessageWeight - b.userMessageWeight || a.timestamp - b.timestamp
    );
}

/**
 * Merge similar conversations
 * - conversationArray is already sorted before calling this method.
 */
export async function mergeConversations(conversationArray) {
    if (!conversationArray || conversationArray.length === 0) {
        return { deleteList: [], mergedList: [] };
    }

    let contradictedConversations = [];
    let nonContradictedConversations = [];

    // Step 1: Separate contradicted and non-contradicted conversations
    for (let i = 0; i < conversationArray.length; i++) {
        let contradict = false;
        const conversationCurrentlyChecking = conversationArray[i];
        for (let j = 0; j < conversationArray.length; j++) {
            if (i === j) {
                continue;
            }
            const conversationCurrentlyCheckingAgainst = conversationArray[j];
            const isContradiction = await detectContradiction(
                conversationCurrentlyChecking.userMessage, 
                conversationCurrentlyCheckingAgainst.userMessage
            );

            if (isContradiction) {
                contradictedConversations.push(conversationCurrentlyChecking);
                contradict = true;
                break;
            }
        }

        if (!contradict) {
            nonContradictedConversations.push(conversationCurrentlyChecking);
        }
    }

    // Step 2: Merge both sets of conversations
    const mergedContradictions = await mergeConversationsByType(contradictedConversations);
    const mergedNonContradictions = await mergeConversationsByType(nonContradictedConversations);

    return {
        deleteList: [...mergedContradictions.deleteList, ...mergedNonContradictions.deleteList],
        mergedList: [...mergedContradictions.mergedList, ...mergedNonContradictions.mergedList]
    };
}

/**
 * Merge conversations (either contradicted or non-contradicted)
 */
async function mergeConversationsByType(conversationList) {
    if (conversationList.length === 0) {
        return { deleteList: [], mergedList: [] };
    }

    let mergedResults = [];
    let conversationsToDelete = [];
    let embeddingsCache = new Map();

    for (let conversation of conversationList) {
        embeddingsCache.set(conversation.userMessage, await ollamaEmbeddings.embedQuery(conversation.userMessage));
    }

    // Step 1: Group conversations into clusters based on semantic similarity
    let clusters = [];
    for (let i = 0; i < conversationList.length; i++) {
        let foundCluster = false;
        let currentEmbedding = embeddingsCache.get(conversationList[i].userMessage); // Get from cache
        for (let cluster of clusters) {
            let clusterEmbedding = embeddingsCache.get(cluster[0].userMessage);
            let similarity = cosineSimilarity(currentEmbedding, clusterEmbedding);
            if (similarity > 0.7) { //Similar enough
                cluster.push(conversationList[i]);
                foundCluster = true;
                break;
            }
        }

        if (!foundCluster) {
            clusters.push([conversationList[i]]);
        }
    }

    // Step 2: Merge conversations within each cluster
    for (let cluster of clusters) {
        if (cluster.length === 1) {
            // No need to merge a single item
            continue;
        }

        // Sort cluster by weight & timestamp (ascending)
        cluster = sortConversationSet(cluster);
        let baseConversation = cluster[cluster.length - 1]; // The most relevant conversation

        //Merge the message
        let mergedMessage = {
            summary: uniqueLastOccurrence(cluster.map(c => c.summary)).join(messageSeparator), //Merge summary (separate by messageSeparator)
            userMessage: uniqueLastOccurrence(cluster.map(c => c.userMessage)).join(messageSeparator), //Merge user message (separate by messageSeparator)
            aiMessage: uniqueLastOccurrence(cluster.map(c => c.aiMessage)).join(messageSeparator),  // Merge AI responses (separate by messageSeparator)
            userMessageWeight: baseConversation.userMessageWeight,  // Use highest weight for merged message
            aiMessageWeight: baseConversation.aiMessageWeight, // AI weight currently is not used
            timestamp: Math.max(...cluster.map(c => c.timestamp))  // Keep latest timestamp as the merged message
        };

        mergedResults.push(mergedMessage);
        conversationsToDelete.push(...cluster); //All the record in this cluser can now be deleted (because they have been merged)
    }

    return { deleteList: conversationsToDelete, mergedList: mergedResults };
}

/** Function to remove duplicates while keeping the last occurrence */
const uniqueLastOccurrence = (array) => {
    let seen = new Map(); // Using Map to track last appearance
    array.forEach(item => {
        let trimmedItem = item.trim();
        seen.set(trimmedItem, trimmedItem); // Always update to keep the last occurrence
    });
    return [...seen.values()]; // Convert Map values back to an array
};

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

export function extractNumber(str) {
    const match = str.match(/\d+/); // Find the first sequence of digits
    return match ? parseInt(match[0], 10) : NaN;
}

export function getClientTime(timeZone = 'UTC') {
    const now = new Date();
    const options = { timeZone: timeZone, hour12: false, timeZoneName: 'short' };
    const parts = now.toLocaleString('en-US', options);
    return parts.replace(/,? (GMT|UTC)/, ' $1');
}
