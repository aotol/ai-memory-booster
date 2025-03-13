#!/usr/bin/env node
/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
import express from "express";
import bodyParser from "body-parser";
import AI_Memory from "../core/index.js"; 
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const app = express();
app.use(bodyParser.json());

// API Endpoints
app.post("/store-memory", async (req, res) => {
    const { summary, userMessage, aiMessage } = req.body;
    let id;
    try {
        id = await AI_Memory.storeMemory(summary, userMessage, aiMessage);
        res.json({ success: true, message: `Memory stored with ID: ${id}` });
    } catch (err) {
        console.log(err);
        res.json({ success: false, message: `Memory failed to be stored: ${err}` });
    }
});

app.post("/retrieve-memory", async (req, res) => {
    const { userMessage } = req.body;
    const response = await AI_Memory.retrieveMemory(userMessage);
    res.json(response);
});

app.post("/chat", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const { userMessage } = req.body;
    if (!userMessage) {
        res.write("data: Error: userMessage is required\n\n");
        res.end();
        return;
    }
    
    await AI_Memory.chat(userMessage, true, (token) => {
        res.write(`data: ${token}\n\n`);
    });
    res.end();
});

app.post("/generate", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const { userMessage } = req.body;
    if (!userMessage) {
        res.write("data: Error: userMessage is required\n\n");
        res.end();
        return;
    }
    
    await AI_Memory.generate(userMessage, true, (token) => {
        res.write(`data: ${token}\n\n`);
    });
    res.end();
});

app.get("/forget", async (req, res) => {
    const { id } = req.query;  // Extract id from query string

    let result;
    if (id) {
        result = await AI_Memory.forget(id);  // Forget a specific memory
    } else {
        result = await AI_Memory.forgetAll(); // Forget all memories
    }
    let response = result
    ? { success: true, message: id ? `Memory with ID ${id} has been deleted!` : "All memories have been deleted!" }
    : { success: false, message: id ? `No memory found with ID ${id}!` : "There is nothing to delete!" };
    res.json(response);
});

// Config APIs
app.get("/config", (req, res) => res.json(AI_Memory.configManager.getAllConfig()));
app.post("/config", (req, res) => {
    AI_Memory.configManager.setAllConfig(req.body);
    res.json({ success: true, message: "Configuration updated", config: AI_Memory.configManager.getAllConfig() });
});

app.get("/spec", async (req, res) => {
    let spec = await AI_Memory.getLlmSpec();
    res.json(spec);
});

app.get("/system", async (req, res) => {
    let system = {
        version
    }
    res.json(system);
});
// Start Server
const HOST = AI_Memory.configManager.getHost();
const PORT = AI_Memory.configManager.getPort();

app.listen(PORT, HOST, () => console.log("AI Memory Booster API is running on http://" + HOST + ":" + PORT));
