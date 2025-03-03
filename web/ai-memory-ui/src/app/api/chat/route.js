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

    const response = await fetch(`${process.env.AI_MEMORY_BOOSTER_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage }),
    });

    const data = await response.json();
    return Response.json(data);
}
