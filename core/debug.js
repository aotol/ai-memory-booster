/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */

import configManager from "./configManager.js";
import fs from "fs";
import path from "path";

// Ensure the logs directory exists
const logDirectory = "./logs";


// Function to get the log file path for the current date (YYYY-MM-DD)
function getLogFilePath() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Ensure 2-digit format
    const day = String(now.getDate()).padStart(2, "0"); // Ensure 2-digit format
    const filename = `${year}-${month}-${day}.log`; // Example: "2025-03-01.log"
    return path.join(logDirectory, filename);
}

// Function to format the current date and time (YYYY-MM-DD HH:mm:ss)
function getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Function to write logs to a daily log file
function writeLog(message) {
    if (!configManager.isDebug()) return; // Skip logging if debug mode is off

    const logFilePath = getLogFilePath();
    const timestamp = getFormattedDateTime();
    const logMessage = `[${timestamp}] ${message}\n`;
    if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
    }
    if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, logMessage, (err) => {
            if (err) console.error("Error writing log:", err);
        });
    } else {
        fs.appendFile(logFilePath, logMessage, (err) => {
            if (err) console.error("Error writing log:", err);
        });
    }
    
}

// Main log function
export async function log(message) {
    if (configManager.isDebug()) {
        const logEntry = `${getFormattedDateTime()} ${message}`;
        console.log(logEntry);
        writeLog(logEntry);
    }
}
