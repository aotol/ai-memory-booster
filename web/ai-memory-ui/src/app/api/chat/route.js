/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */

export async function POST(req) {
    const { userMessage } = await req.json();

    return new Response(
        new ReadableStream({
            async start(controller) {
                const response = await fetch(`${process.env.AI_MEMORY_BOOSTER_API_URL}/chat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userMessage }),
                });

                if (!response.body) {
                    controller.close();
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n");

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const token = line.replace("data: ", "");
                            controller.enqueue(token);
                        }
                    }
                }
                controller.close();
            },
        }),
        {
            headers: { "Content-Type": "text/event-stream" },
        }
    );
}
