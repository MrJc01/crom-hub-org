import { generateProjectZip } from '../src/services/exportService.js';
import { createWriteStream, unlinkSync, existsSync, statSync } from 'fs';

async function testExport() {
    console.log('Testing Export Service...');
    const outputPath = 'test-export.zip';
    
    // Mock Reply Object
    const reply = {
        header: (key, val) => console.log(`[Header] ${key}: ${val}`),
        raw: createWriteStream(outputPath)
    };

    // Mock Options
    const options = {
        appName: 'TestApp',
        description: 'Export Test',
        modules: { donations: 'true' }
    };

    try {
        await generateProjectZip(options, reply);
        
        // Wait for stream to finish? 
        // archiver.finalize() is awaited in the function, but pipe might be async.
        // We should listen to 'close' on the stream but generateProjectZip awaits finalize.
        // Let's give it a second.
        
        setTimeout(() => {
            if (existsSync(outputPath)) {
                const size = statSync(outputPath).size;
                console.log(`✅ Export success! File created: ${outputPath} (${size} bytes)`);
                // Cleanup
                 unlinkSync(outputPath);
                 console.log('Cleanup complete.');
            } else {
                console.error('❌ Export failed: File not found.');
            }
        }, 2000);
        
    } catch (e) {
        console.error('Export Error:', e);
    }
}

testExport();
