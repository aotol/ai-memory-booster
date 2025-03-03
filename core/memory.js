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
import { OllamaEmbeddings } from "@langchain/ollama";
import { randomUUID } from "crypto";
import configManager from "./configManager.js";

const ollamaEmbeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
const collectionName = "ai_memory_booster"; // ChromaDB Collection
let chromaClient;
let collection;
let sqlite;
let cache;

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
            aiMessage TEXT,
            embedding BLOB,
            timestamp INTEGER
        );
    `);
}

/** Initialize ChromaDB */
async function initializeChromaDB() {
    chromaClient = new ChromaClient({ path: configManager.getChromaDBHost(), tenant: configManager.getTenant() });
    collection = await chromaClient.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: ollamaEmbeddings,
        dimension: configManager.getDimension(),
    });
}

/** Initialize FAISS cache */
function initializeCache() {
    cache = new faiss.IndexFlatL2(configManager.getDimension());
}

/** Initialize all services */
async function initialize() {
    await initializeSqlite();
    await initializeChromaDB();
    initializeCache();
}

/** Store Memory */
export async function storeMemory(summary, userMessage, aiMessage) {
    if (!summary) {
        summary = await summarizeConversation("", userMessage, aiMessage);
    }
    const id = randomUUID();
    const timestamp = Date.now();
    const vector = await getEmbedding(summary);

    if (await isChromaDBAvailable()) {
        await collection.add({
            ids: [id],
            documents: [summary],
            embeddings: [vector],
            metadatas: [{ userMessage, aiMessage, timestamp }],
        });
    } else {
        await sqlite.run("INSERT INTO memories (id, summary, userMessage, aiMessage, embedding, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            [id, summary, userMessage, aiMessage, Buffer.from(new Float32Array(vector).buffer), timestamp]);
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

let retrieveRelevantMemoryFromCache = async function (userMessage) {
    const queryVector = await getEmbedding(userMessage);
    // Retrieve from FAISS
    const ntotal = cache.ntotal();
    const faissResults = ntotal > 0 
        ? cache.search(queryVector, Math.min(ntotal, configManager.getSimilarityResultCount())) 
        : [];
    return faissResults;
}

/** Read Memory */
export async function readMemoryFromDB (userMessage, similarityResultCount) {
    let conversationSet = new Set();
    let rawResults;
    if (await isChromaDBAvailable()) {
        const queryVector = await getEmbedding(userMessage);
        // Retrieve from ChromaDB
        const chromaResult = await collection.query({
            queryEmbeddings: [queryVector],
            nResults: similarityResultCount,
            //include: ["documents", "embeddings", "metadatas", "distances"]
        });
        rawResults = convertChromaResultToConversationSet(chromaResult);
    } else {
        const faissResult = await retrieveRelevantMemoryFromCache(userMessage);
        const { distances, indices } = faissResult;
        let sqliteResult = [];
        for (let i = 0; indices && i < indices.length; i++) {
            if (indices[i] >= 0) {
                const row = await sqlite.get("SELECT * FROM memories WHERE rowid = ?", [indices[i] + 1]);
                if (row) {
                    sqliteResult.push({
                        id: row.id,
                        summary: row.userMessage,
                        userMessage: row.userMessage,
                        aiMessage: row.aiMessage,
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
    let sortedConversations = [...conversationSet].sort((a, b) => b.timestamp - a.timestamp);
    return sortedConversations;
}

let convertChromaResultToConversationSet = function (retrievedMemories) {
    if (retrievedMemories && !Array.isArray(retrievedMemories)) {
        retrievedMemories = [retrievedMemories];
    }
    const conversationSet = new Set();
    for (let memoryLoop = 0; retrievedMemories && memoryLoop < retrievedMemories.length; memoryLoop++) {
        const memory = retrievedMemories[memoryLoop];
        for (let i = 0; memory.ids && i < memory.ids.length; i++) {  // Iterate through all matches
            const ids = memory.ids[i];
            for (let j = 0; j < ids.length; j++) {
                const id = ids[j];
                const distance = memory.distances[i][j] ?? Infinity;  //The distance between the result and the text. Smaller, the better
                const summary = memory.documents[i][j] || "";
                const userMessage = memory.metadatas[i][j].userMessage || "";
                const aiMessage = memory.metadatas[i][j].aiMessage || "";
                const timestamp = memory.metadatas[i][j].timestamp || 0;
                conversationSet.add({summary, id, distance, userMessage, aiMessage, timestamp});
            }
        }
    }
    return conversationSet;
}

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
        const aiMessage = memory.aiMessage || "";
        const timestamp = memory.timestamp || 0;
        conversationSet.add(id, distance, summary, userMessage, aiMessage, timestamp);
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

/** Get Text Embedding */
async function getEmbedding(text) {
    return await ollamaEmbeddings.embedQuery(text);
}

/** Initialize the module */
await initialize();
