// Switch environment script
import { copyFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function switchEnv(env) {
    if (env !== 'dev' && env !== 'prod') {
        console.error('Error: Environment must be either "dev" or "prod"');
        process.exit(1);
    }

    // Use Vite's naming convention for environment files. When env = 'dev',
    // copy `.env.development`; when env = 'prod`, copy `.env.production`.
    let sourceFile;
    if (env === 'dev') {
        sourceFile = join(rootDir, '.env.development');
    } else {
        sourceFile = join(rootDir, '.env.production');
    }
    const targetFile = join(rootDir, '.env');

    try {
        await copyFile(sourceFile, targetFile);
        console.log(`Successfully switched to ${env} environment using ${sourceFile}`);
    } catch (error) {
        console.error(`Error switching environment: ${error.message}`);
        console.error(`Make sure the required environment file ('.env.development' or '.env.production') exists in the frontend directory`);
        process.exit(1);
    }
}

// Get environment from command line argument
const env = process.argv[2];
switchEnv(env);
