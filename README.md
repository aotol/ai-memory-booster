# AI Memory Booster

**AI Memory Booster** is an AI-powered memory enhancement module that enables **long-term AI memory** and retrieval of conversations using embeddings and vector databases.

**Online demo** [https://aimemorybooster.com](https://aimemorybooster.com)

## 📚 Table of Contents

- [🚀 Features](#-features)
- [📦 Installation](#-installation)
  - [🔤 Quick Setup for MacOS/Linux Users](#-quick-setup-for-macoslinux-users)
  - [Manual Install Instruction](#manual-install-instruction)
    - [Pre-requisites](#pre-requisites)
    - [Install Ollama](#install-ollama)
    - [Install ChromaDB](#install-chromadb)
    - [Install AI Memory Booster via npm](#install-ai-memory-booster-via-npm)
- [🎯 Usage](#-usage)
- [🔧 Configuration](#-configuration)
  - [Example config.json](#example-configjson)
  - [ConfigManager Usage](#configmanager-usage)
- [🔧 Development](#-development)
- [📜 License](#-license)
- [📩 Contact](#-contact)

## 🚀 Features

- **Fully deployable on-premise**: Run locally to maintain full control, meet strict compliance, and ensure enhanced data privacy.
- **Self-learning capability**: Continuously adapts to user environments for more personalized performance over time.
- **Permanent long-term memory**: Retains information across sessions and system restarts.
- **Offline functionality**: Operates without internet access, improving performance and reducing external dependencies.
- **LLM-agnostic**: Integrates with any LLM based on your infrastructure or budget.
- **Simple to manage**: Configure easily using a JSON file or via the built-in admin portal.
- **Seamless integration**: Provides an NPM package, REST API, and a web interface for plug-and-play deployment.
- **Fully user-owned**: Avoids reliance on third-party AI services, lowering costs and boosting independence.

## 📦 Installation

### 🔤 Quick Setup for MacOS/Linux Users

For MacOS or Linux users, we provide a script to automate the setup process:

```sh
./install.sh
```

This script will:
- Install dependencies
- Setup environment variables (`.env.local`)
- Launch required services (e.g., ChromaDB)

Make sure the script has executable permission:
```sh
chmod +x install.sh
```

### Manual Install Instruction
#### Pre-requisites
Before running AI Memory Booster, ensure that you have **Ollama** and **ChromaDB** installed.

##### Install Ollama
Follow the official installation guide at: [https://ollama.ai/](https://ollama.ai/)

##### Install ChromaDB
Ensure ChromaDB is installed and running:
```sh
pip install chromadb
chroma run --path ./chroma_db
```

#### Install AI Memory Booster via npm:
```sh
npm install ai-memory-booster
```

## 🎯 Usage

AI Memory Booster provides the following methods:

### Store Memory
Injects a memory entry into AI Memory Booster.
```js
await AI_Memory.storeMemory("Today is Wednesday and it is raining", "Today is Wednesday, how's the weather?", "It is raining");
```

### Retrieve Memory
Fetches relevant stored memories based on a user's message.
```js
const memory = await AI_Memory.retrieveMemory("How's the weather today?");
console.log(memory);
```
**Response Example:**
```js
{
  "id": "99c326e8-e234-4049-8661-3d9427944071",
  "distance": 0.1, // The distance between the query and result (smaller is better)
  "summary": "Today is Wednesday and it is raining",
  "userMessage": "Today is Wednesday, how's the weather?",
  "aiMessage": "It is raining",
  "timestamp": 1740999657717
}
```

### Forget Memory
Deletes a memory entry by ID.
```js
const success = await AI_Memory.forget("99c326e8-e234-4049-8661-3d9427944071");
console.log(success); // true if deleted, false if ID is null
```

### Forget All Memories
Deletes all stored memory entries.
```js
const success = await AI_Memory.forgetAll();
console.log(success); // true if deleted, false if no memories exist
```

### Get LLM Specification
Retrieves details about the current LLM module.
```js
const llmSpec = await AI_Memory.getLlmSpec();
console.log(llmSpec);
```

### Chat with AI Memory Booster
Interacts with the AI while using stored memory (For chat).
```js
const response = await AI_Memory.chat("How's the weather today?");
console.log(response); // "It is raining today!"
```

### Generate content with AI Memory Booster
Interacts with the AI while using stored memory (For generating text content).
```js
const response = await AI_Memory.generate("How's the weather today?");
console.log(response); // "It is raining."
```

## 🔧 Configuration

AI Memory Booster allows full customization through `config.json`. Users can modify AI model settings, server configurations, memory management, and ChromaDB parameters. The configuration can be updated in two ways:

- **Directly modifying `config.json`**
- **Using AI Memory Booster UI for easy configuration updates**

### Example config.json:

```js
{
  "aiModel": "llama3.2", // The primary AI model (must be downloaded first)
  "learnFromChat": true, // Determines if AI should learn from conversations
  "host": "localhost", // The host address when running AI Memory Booster as an API service
  "port": 4000, // The port for the AI Memory Booster API service
  "baseKeepAlive": 3000, // Duration (ms) the LLM module stays active after each call
  "extendedKeepAlive": 10000, // Extended duration (ms) the LLM remains active if no other requests arrive
  "similarityResultCount": 3, // Number of similar records retrieved from the database
  "categorySureThreshold": 49, // Threshold for AI to confidently classify a response
  "maxUserMessageCharacterLimit": 10000, //Max user message length allowed
  "summaryCharacterLimit": 256, // Maximum character length for conversation summaries
  "dimension": 768, // Dimensionality of vector embeddings
  "similarityThreshold": 0.7, // Threshold for similarity-based searches
  "consolidateConversationThreshold": 256, // Threshold for summarizing conversations
  "chromaDBHost": "http://localhost:8000", // ChromaDB service URL (host and port)
  "tenant": "default_tenant", // ChromaDB tenant name
  "collection": "ai_memory_booster", // ChromaDB collection name used by AI Memory Booster
  "rolePrompt": "You are a personal assistant. 'AI' represents you, and 'User' represents the person currently talking to you. When the user says 'I', 'mine', 'me' or 'my', it refers to the user, not you ('AI'). Do not fabricate responses.", // Prompt for how AI should respond based on past memory
  "debug": false, // If turn on the debug message
  "archive": false, // If turn on the memory archive mode
}
```

### ConfigManager Usage:

Users can dynamically get and set configurations via `configManager`:

```js
const port = AI_Memory.configManager.getPort();
console.log(`Running on port: ${port}`);

AI_Memory.configManager.setPort(8080);
console.log(`Updated port: ${AI_Memory.configManager.getPort()}`);
```

## 🔧 Development

Clone and install dependencies:
```sh
git clone https://github.com/aotol/ai-memory-booster.git
cd ai-memory-booster
npm install
```

To start AI Memory Booster as a standalone API service:
```sh
npx ai-memory-booster start
```

To launch AI Memory Booster UI, go to:
```sh
cd ai-memory-booster/web/ai-memory-ui/
npm run dev
```
Make sure you have set the environment variable: `AI_MEMORY_BOOSTER_API_URL` to identify where AI Memory Booster API service is running.

e.g.:
```sh
export AI_MEMORY_BOOSTER_API_URL="http://localhost:4000"
```
Alternatively, create a ```.env.local``` file under ```ai-memory-ui``` directory and set the content to:
```
AI_MEMORY_BOOSTER_API_URL=http://localhost:4000
```

## 📜 License

**MIT License** - AI Memory Booster versions **1.x.x** are free and open-source under the MIT License.

> **Note:** Starting from version **2.0.0**, AI Memory Booster will be available as a **commercial version** with multi-tenant (user) support and advanced features. For commercial licensing and inquiries about **2.0.0** and above, please contact **zhan@aotol.com**.

## 📩 Contact

Author: **Aotol Pty Ltd**\
Email: **[zhan@aotol.com](mailto:zhan@aotol.com)**\
Website: **[https://github.com/aotol/ai-memory-booster](https://github.com/aotol/ai-memory-booster)**

---

🚀 **Start building with AI Memory Booster today!**
