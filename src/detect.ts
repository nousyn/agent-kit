import fs from 'node:fs/promises';
import os from 'node:os';
import type { AgentType } from './types.js';
import { AGENT_REGISTRY, CLIENT_NAME_MAP } from './types.js';

/**
 * Detect which agent is present by checking characteristic files.
 *
 * Independent function — does not require register().
 */
export async function detectAgent(cwd?: string): Promise<AgentType | null> {
    const startDir = cwd ?? process.cwd();
    const home = os.homedir();

    for (const [agentType, entry] of Object.entries(AGENT_REGISTRY)) {
        const paths = entry.detectionPaths(startDir, home);
        for (const p of paths) {
            try {
                await fs.access(p);
                return agentType as AgentType;
            } catch {
                continue;
            }
        }
    }

    return null;
}

/**
 * Map an MCP clientInfo.name to AgentType.
 *
 * Independent function — does not require register().
 */
export function detectAgentFromClient(clientName: string): AgentType | null {
    return CLIENT_NAME_MAP[clientName] ?? null;
}
