/**
 * AI Memory Booster
 * 
 * Copyright (c) 2025 Aotol Pty Ltd
 * Licensed under the MIT License (see LICENSE file for details)
 * 
 * Author: Zhan Zhang <zhan@aotol.com>
 */
export async function GET() {
    const response = await fetch(`${process.env.AI_MEMORY_BOOSTER_API_URL}/spec`, { method: "GET" });
    const data = await response.json();
    return Response.json(data);
}
