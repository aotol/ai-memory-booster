/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import faiss from "faiss-node";
import { ChromaClient } from "chromadb";
import { randomUUID } from "crypto";
import configManager from "./configManager.js";
import {ollamaEmbeddings} from "./llm.js";
import {log} from "./debug.js";
import { adjustVectorSize, sortConversationSet, calculateConversationWeight } from "./util.js";

const collectionName = configManager.getCollection(); // ChromaDB Collection
let chromaClient;
let collection;
let sqlite;
let cache;
let memoryMetadata = []; // Store {id, userMessage, aiMessage} pairs

/** Initialize SQLite */
async function initializeSqlite() {
    sqlite = await open({
        filename: "./sqlite_memory.db",
        driver: sqlite3.Database,
    });
    await sqlite.exec(`
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            summary TEXT,
            userMessage TEXT,
            userMessageWeight INTEGER,
            aiMessage TEXT,
            aiMessageWeight INTEGER,
            embedding BLOB,
            timestamp INTEGER
        );
    `);
}

/** Initialize ChromaDB */
async function initializeChromaDB() {
    try {
        chromaClient = new ChromaClient({ path: configManager.getChromaDBHost(), tenant: configManager.getTenant() });
        collection = await chromaClient.getOrCreateCollection({
            name: collectionName,
            embeddingFunction: async (text) => {
                const embedding = await ollamaEmbeddings.embedQuery(text);
                return embedding;
            },
            dimension: configManager.getDimension(),
        });
    } catch (err) {
        console.error("ChromaDB is throwing:\n" + err + "\nAI Memory Booster may not function as expected.\nInstall ChromaDB: pip install chromadb\nLaunch ChromaDB: chroma run --path ./chroma_db");
    }
}

/** Initialize FAISS cache */
function initializeCache() {
    cache = new faiss.IndexFlatL2(configManager.getDimension());
    memoryMetadata = [];
}

/** Initialize all services */
async function initialize() {
    await initializeSqlite();
    await initializeChromaDB();
    initializeCache();
}

export async function cacheConversation(userMessage, aiMessage, conversationSet) {
    const conversationWeight = await calculateConversationWeight(userMessage, aiMessage, conversationSet);
    const userMessageWeight = conversationWeight.userMessageWeight;
    const aiMessageWeight = conversationWeight.aiMessageWeight;
    return await cacheMemory(userMessage, userMessageWeight, aiMessage, aiMessageWeight);
}

async function cacheMemory(userMessage, userMessageWeight = 0, aiMessage, aiMessageWeight = 0, timestamp = Date.now()) {
    let id;
    try {
        // Convert userMessage to an embedding vector
        const embedding = await ollamaEmbeddings.embedQuery(userMessage);

        if (!embedding || embedding.length === 0) {
            console.error("Error: Generated embedding is empty.");
            return;
        }

        // Check the expected dimension
        const reducedEmbedding = adjustVectorSize(embedding);

        // Validate dimensions before inserting
        if (reducedEmbedding.length !== configManager.getDimension()) {
            console.error(`Error: Embedding dimension mismatch. Expected ${cache.d}, got ${embedding.length}`);
            return;
        }

        // Add vector to FAISS cache
        cache.add(reducedEmbedding);

        // Get the updated index count after insertion
        id = cache.ntotal() - 1;

        // Store metadata separately
        memoryMetadata.push({ id, userMessage, userMessageWeight, aiMessage, aiMessageWeight, timestamp });
        log("Memory cached successfully.");
    } catch (error) {
        console.error("Error caching memory:", error);
    }
    return id;
}

/** Store Memory */
export async function storeMemory(summary, userMessage, userMessageWeight = 0, aiMessage, aiMessageWeight = 0, timestamp = Date.now()) {
    if (!summary) {
        summary = await summarizeConversation("", userMessage, aiMessage);
    }
    const id = randomUUID();
    const vector = await ollamaEmbeddings.embedQuery(summary);
    const reducedVector = adjustVectorSize(vector);
    if (await isChromaDBAvailable()) {
        await collection.add({
            ids: [id],
            documents: [summary],
            embeddings: [reducedVector],
            metadatas: [{ userMessage, userMessageWeight, aiMessage, aiMessageWeight, timestamp }],
        });
    } else {
        await sqlite.run("INSERT INTO memories (id, summary, userMessage, userMessageWeight, aiMessage, aiMessageWeight, embedding, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            [id, summary, userMessage, userMessageWeight, aiMessage, aiMessageWeight, Buffer.from(new Float32Array(vector).buffer), timestamp]);
        cache.add(vector);
    }
    return id;
}

/** Retrieve Memory */
export async function retrieveMemory(userMessage) {
    const conversationSet = await readMemoryFromDB(userMessage, configManager.getSimilarityResultCount());
    return conversationSet;
}

/** Forget Memory */
export async function forgetAll() {
    if (await isChromaDBAvailable()) {
        const ids = (await collection.get()).ids;
        if (ids.length === 0) {
            return false;
        } {
            await collection.delete({ids: ids});
        }
    } else {
        await sqlite.run("DELETE FROM memories");
    }
    initializeCache();  //reset cache
    return true;
}

export async function forget(id) {
    if (!id) {
        return false;
    }
    if (await isChromaDBAvailable()) {
        await collection.delete({ids: [id]});
    } else {
        await sqlite.run("DELETE FROM memories WHERE id = ?", [id]);
    }
    return true;
}

export async function readMemoryFromCache (userMessage, similarityResultCount) {
    const queryVector = await ollamaEmbeddings.embedQuery(userMessage);
    const reducedQueryVector = adjustVectorSize(queryVector);
    // Retrieve from FAISS
    const ntotal = cache.ntotal();
    const faissResults = ntotal > 0 
        ? cache.search(reducedQueryVector, Math.min(ntotal, similarityResultCount)) 
        : [];

    const conversationSet = new Set();
    const { distances, labels } = faissResults;
    let i = 0;
    if (labels) {
        labels.forEach(label => {
            const distance = distances[i] ?? Infinity;
            const id = label;   //id in cache
            const result = getMemoryFromCacheById(id);
            const summary = result?.userMessage || "";
            const userMessage = result?.userMessage || "";
            const userMessageWeight = result?.userMessageWeight || 0;
            const aiMessage = result?.aiMessage || "";
            const aiMessageWeight = result?.aiMessageWeight || 0;
            const timestamp = result?.timestamp || 0;
            conversationSet.add({
                summary, 
                //id: "", //Since this record is not from DB, so there is no database id
                distance, 
                userMessage, 
                userMessageWeight, 
                aiMessage, 
                aiMessageWeight, 
                timestamp
            });
            i ++;
        });
    }
    
    return conversationSet;
}

export function getMemoryFromCacheById(id) {
    return memoryMetadata.find(memory => memory.id === id);
}

export function updatetMemoryCache(memory) {
    const index = memoryMetadata.findIndex(memoryItem => memoryItem.id === memory.id);
    if (index !== -1) {
        // Update the existing memory in the cache
        memoryMetadata[index] = memory;
    } else {
        throw new Error(`Memory with ID ${memory.id} not found in cache.`);
    }
}
//It returns array
export async function readMemoryFromCacheAndDB(userMessage, similarityResultCount) {
    const conversationDBSet = await readMemoryFromDB(userMessage, similarityResultCount);
    const conversationCacheSet = await readMemoryFromCache(userMessage, similarityResultCount);
    const conversationArray = mergeConversationSet(conversationDBSet, conversationCacheSet);
    return conversationArray;
}

/** Read Memory */
export async function readMemoryFromDB (userMessage, similarityResultCount) {
    let conversationSet = new Set();
    let rawResults;
    let chromaResult;
    if (await isChromaDBAvailable()) {
        if (!userMessage) {
            chromaResult = await collection.get();  //Get all the records
        } else {
            const queryVector = await ollamaEmbeddings.embedQuery(userMessage);
            const reducedVector = adjustVectorSize(queryVector);
            // Retrieve from ChromaDB
            chromaResult = await collection.query({
                queryEmbeddings: [reducedVector],
                nResults: similarityResultCount,
                //include: ["documents", "embeddings", "metadatas", "distances"]
            });
        }
        rawResults = convertChromaResultToConversationSet(chromaResult);
    } else {
        const faissResult = await readMemoryFromCache(userMessage, similarityResultCount);
        const { distances, indices: lables } = faissResult;
        let sqliteResult = [];
        for (let i = 0; lables && i < lables.length; i++) {
            if (lables[i] >= 0) {
                const row = await sqlite.get("SELECT * FROM memories WHERE rowid = ?", [lables[i] + 1]);
                if (row) {
                    sqliteResult.push({
                        id: row.id,
                        summary: row.userMessage,
                        userMessage: row.userMessage,
                        userMessageWeight: row.userMessageWeight,
                        aiMessage: row.aiMessage,
                        aiMessageWeight: row.aiMessageWeight,
                        distance: distances[i] // FAISS also returns distance
                    });
                }
            }
        }
        rawResults = convertSqliteResultToConversationSet(sqliteResult);
    }
    //Make sure the result are similar enough
    rawResults.forEach(conversation => {
        if (conversation.distance < configManager.getSimilarityThreshold()) {
            conversationSet.add(conversation);
        }
    });
    // Convert Set to Array, Sort by timestamp (descending)
    let sortedConversations = sortConversationSet(conversationSet);
    return sortedConversations;
}

function mergeConversationSet(conversationSetFromDB, conversationSetFromCache) {
    // Merge both sets
    let mergedSet = [...conversationSetFromDB, ...conversationSetFromCache];
    // Sort by timestamp (ascending order)
    let sortedConversations = sortConversationSet(mergedSet);    //It is now in array (Not Set)
    // Remove duplicates while keeping the highest-weight/latest-timestamp entry
    let uniqueConversations = new Map();
    sortedConversations.forEach(conv => {
        let key = `${conv.summary}-${conv.userMessage}`; // Unique key based on summary + userMessage
        if (!uniqueConversations.has(key)) {
            uniqueConversations.set(key, conv);
        }
    });
    return Array.from(uniqueConversations.values());
}

let convertChromaResultToConversationSet = function (retrievedMemories) {
    if (retrievedMemories && !Array.isArray(retrievedMemories)) {
        retrievedMemories = [retrievedMemories];
    }
    const conversationSet = new Set();
    for (let memoryLoop = 0; retrievedMemories && memoryLoop < retrievedMemories.length; memoryLoop++) {
        const memory = retrievedMemories[memoryLoop];
        // Check if the data structure is from `query` (nested arrays) or `get` (flat arrays)
        const isQueryFormat = Array.isArray(memory.ids[0]);  
        if (isQueryFormat) {
            // Handle `query` response (nested arrays)
            for (let i = 0; memory.ids && i < memory.ids.length; i++) {
                const ids = memory.ids[i];
                for (let j = 0; j < ids.length; j++) {
                    const id = ids[j];
                    const distance = memory.distances[i][j] ?? Infinity;
                    const summary = memory.documents[i][j] || "";
                    const userMessage = memory.metadatas[i][j]?.userMessage || "";
                    const userMessageWeight = memory.metadatas[i][j]?.userMessageWeight || 0;
                    const aiMessage = memory.metadatas[i][j]?.aiMessage || "";
                    const aiMessageWeight = memory.metadatas[i][j]?.aiMessageWeight || 0;
                    const timestamp = memory.metadatas[i][j]?.timestamp || 0;
                    conversationSet.add({ summary, id, distance, userMessage, userMessageWeight, aiMessage, aiMessageWeight, timestamp });
                }
            }
        } else {
            // Handle `get` response (flat arrays)
            for (let i = 0; memory.ids && i < memory.ids.length; i++) {
                const id = memory.ids[i];
                const distance = 0;  // `get` does not return distances
                const summary = memory.documents[i] || "";
                const userMessage = memory.metadatas[i]?.userMessage || "";
                const userMessageWeight = memory.metadatas[i]?.userMessageWeight || 0;
                const aiMessage = memory.metadatas[i]?.aiMessage || "";
                const aiMessageWeight = memory.metadatas[i]?.aiMessageWeight || 0;
                const timestamp = memory.metadatas[i]?.timestamp || 0;
                conversationSet.add({ summary, id, distance, userMessage, userMessageWeight, aiMessage, aiMessageWeight, timestamp });
            }
        }
    }
    
    return conversationSet;
};


let convertSqliteResultToConversationSet = function (retrievedMemories) {
    if (retrievedMemories && !Array.isArray(retrievedMemories)) {
        retrievedMemories = [retrievedMemories];
    }
    const conversationSet = new Set();
    for (let i = 0; retrievedMemories && i < retrievedMemories.length; i++) {
        const memory = retrievedMemories[i];
        const id = memory.id;
        const distance = memory.distance ?? Infinity;
        const summary = memory.summary || "";
        const userMessage = memory.userMessage || "";
        const userMessageWeight = memory.userMessageWeight || 0;
        const aiMessage = memory.aiMessage || "";
        const aiMessageWeight = memory.aiMessageWeight || 0;
        const timestamp = memory.timestamp || 0;
        conversationSet.add(id, distance, summary, userMessage, userMessageWeight, aiMessage, aiMessageWeight, timestamp);
    }
    return conversationSet;
}

/** Check if ChromaDB is Available */
async function isChromaDBAvailable() {
    try {
        await chromaClient.listCollections();
        return true;
    } catch {
        return false;
    }
}

/** Initialize the module */
await initialize();
