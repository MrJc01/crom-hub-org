import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config/loader.js';

const execAsync = promisify(exec);
const REPO_API = 'https://api.github.com/repos/MrJc01/crom-hub-org/tags';

/**
 * Checks for updates on GitHub
 * @returns {Promise<{latest: string, current: string, hasUpdate: boolean}>}
 */
export async function checkForUpdates() {
    try {
        const response = await fetch(REPO_API, {
            headers: { 'User-Agent': 'Hub-Org-Updater' }
        });
        
        if (!response.ok) throw new Error('Falha ao conectar ao GitHub');
        
        const tags = await response.json();
        const latest = tags[0]?.name;
        // Package version usually doesn't have 'v', but tags do. Standardize.
        const current = config.version.startsWith('v') ? config.version : `v${config.version}`;
        
        return {
            latest,
            current,
            hasUpdate: latest && latest !== current
        };
    } catch (err) {
        throw new Error(`Erro na verificação: ${err.message}`);
    }
}

/**
 * Performs the system update
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
export async function performUpdate() {
    try {
        // Chained update commands
        const { stdout, stderr } = await execAsync('git pull origin main && npm install && npx prisma generate');
        return { success: true, stdout, stderr };
    } catch (err) {
        return { 
            success: false, 
            stdout: err.stdout || '', 
            stderr: err.stderr || err.message 
        };
    }
}
