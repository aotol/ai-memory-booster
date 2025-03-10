import fs from 'fs';
import path from 'path';
import {log} from './debug.js';
/** Archive memory to a JSON file and delete from ChromaDB */
export function archiveToFile(conversation) {
    if (!conversation) {
        log(`Archive failed: Conversation is empty.`);
        return;
    }
    const id = conversation.id;
    // Define archive file path
    const archiveDir = "./archives";
    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir); // Create archives folder if it doesn't exist
    }
    const archivePath = path.join(archiveDir, `${id}.json`);
    // Save the conversation as a JSON file
    fs.writeFileSync(archivePath, JSON.stringify(conversation, null, 2));
    log(`Conversation ${id} archived to file: ${archivePath}`);
}

export async function getArchivedMemory(id) {
    const archivePath = path.join(__dirname, 'archives', `${id}.json`);
    if (!fs.existsSync(archivePath)) {
        log(`Archived conversation with ID ${id} not found.`);
        return null;
    }
    const archivedData = fs.readFileSync(archivePath, 'utf-8');
    return JSON.parse(archivedData);
}