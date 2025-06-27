const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const mime = require('mime-types');
require('dotenv').config();
const { Kafka } = require('kafkajs');

// SSM client configuration
const ssmClient = new SSMClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESSKEY,
        secretAccessKey: process.env.AWS_SECRETACCESSKEY
    }
});

// Function to update package.json homepage
function updatePackageJsonHomepage(projectDir) {
    try {
        const packageJsonPath = path.join(projectDir, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            console.log('No package.json found, skipping homepage update');
            return;
        }

        console.log(`Updating homepage in ${packageJsonPath}`);
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Set the homepage to the correct S3 path - IMPORTANT: changed to match the file upload structure
        const homepagePath = `/__outputs/${PROJECT_ID}`;
        packageJson.homepage = homepagePath;
        
        // Write the updated package.json
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log(`Set homepage to: ${homepagePath}`);
    } catch (error) {
        console.error('Error updating package.json homepage:', error);
    }
}

// Function to create or update vite.config.js for Vite-based apps
function updateViteConfig(projectDir) {
    try {
        // Check if this might be a Vite project
        const packageJsonPath = path.join(projectDir, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return false;
        }
        
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        // Check if vite is a dependency
        const isViteProject = dependencies && (dependencies.vite || dependencies['@vitejs/plugin-react']);
        
        if (!isViteProject) {
            console.log('Not a Vite project, skipping vite.config.js update');
            return false;
        }
        
        console.log('Detected Vite project, updating vite.config.js');
        
        // Path for the base URL - IMPORTANT: changed to match the file upload structure
        const basePath = `/__outputs/${PROJECT_ID}/`;
        
        // Check if vite.config.js exists
        const viteConfigPath = path.join(projectDir, 'vite.config.js');
        
        if (fs.existsSync(viteConfigPath)) {
            // Read existing config
            const existingConfig = fs.readFileSync(viteConfigPath, 'utf8');
            
            // Check if base is already set
            if (existingConfig.includes('base:') && !existingConfig.includes(`base: '${basePath}'`)) {
                // Replace existing base setting
                const updatedConfig = existingConfig.replace(
                    /base:\s*['"][^'"]*['"]/,
                    `base: '${basePath}'`
                );
                fs.writeFileSync(viteConfigPath, updatedConfig);
            } else if (!existingConfig.includes('base:')) {
                // Add base setting to existing config
                const updatedConfig = existingConfig.replace(
                    /export default defineConfig\(\{/,
                    `export default defineConfig({\n  base: '${basePath}',`
                );
                fs.writeFileSync(viteConfigPath, updatedConfig);
            }
        } else {
            // Create new vite.config.js
            const newConfig = `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '${basePath}',
  plugins: [react()],
})
`;
            fs.writeFileSync(viteConfigPath, newConfig);
        }
        
        console.log(`Updated vite.config.js with base: '${basePath}'`);
        return true;
    } catch (error) {
        console.error('Error updating vite.config.js:', error);
        return false;
    }
}

//getting kafka broker information securely from managers
async function getKafkaBroker() {
    const params = {
        Name: 'KAFKA_BROKER',
        WithDecryption: true
    };

    try {
        const command = new GetParameterCommand(params);
        const response = await ssmClient.send(command);
        return response.Parameter.Value; // Kafka broker IP:port
    } catch (e) {
        console.error('Error getting Kafka broker information:', e);
        return null;
    }
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
}

// S3 client configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESSKEY,
        secretAccessKey: process.env.AWS_SECRETACCESSKEY
    }
});

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;
const GIT_URI = process.env.GIT_URI;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'user-build-codes';
const MAX_CONCURRENT_UPLOADS = parseInt(process.env.MAX_CONCURRENT_UPLOADS || '5', 10);

// Log publisher function
async function publishLog(log, producer, logLevel = 'info', fileDetails = {}) {
    const logMessage = {
        PROJECT_ID,
        DEPLOYMENT_ID,
        GIT_URI,
        log,
        logLevel: logLevel,  // Ensure log level is passed properly
        ...fileDetails, // Spread fileDetails into the log message
    };

    await producer.send({
        topic: 'builder-logs',
        messages: [{
            key: 'log',
            value: JSON.stringify(logMessage)
        }]
    });
}

//helper method to upload single file to s3
async function uploadToS3(filePath, s3Key, producer, maxRetries = 3) {
    const fileSize = fs.statSync(filePath).size;
    const readableFileSize = formatFileSize(fileSize);
    const startTime = Date.now();

    console.log('Uploading', filePath, 'to', s3Key);
    publishLog(`Uploading ${path.basename(filePath)}`, producer, 'PROCESSING', {
        fileName: path.basename(filePath),
        fileSize: readableFileSize,
        fileSizeInBytes: fileSize,
    });

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath) || 'application/octet-stream'
    });

    let retries = 0;
    while (retries <= maxRetries) {
        try {
            await s3Client.send(command);
            const endTime = Date.now();
            const timeTaken = (endTime - startTime) / 1000;

            console.log('Uploaded', path.basename(filePath));
            const logMessage = {
                timestamp: new Date().toISOString(),
                eventType: 'upload_completed',
                fileName: path.basename(filePath),
                fileSize: readableFileSize,
                fileSizeInBytes: fileSize,
                timeTaken: timeTaken,
                status: 'success',
                message: `File uploaded successfully to S3`
            };

            publishLog('actual data', producer, 'info', logMessage);
            return true;
        }
        catch (error) {
            retries++;
            if (retries > maxRetries) {
                console.log(`Error uploading file after ${maxRetries} attempts:`, error.message);
                publishLog(`Error uploading ${path.basename(filePath)}: ${error.message}`, producer, 'error');
                return false;
            }

            // Exponential backoff
            const delay = Math.pow(2, retries) * 100;
            console.log(`Retry attempt ${retries}/${maxRetries} for ${path.basename(filePath)} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

//helper function to upload directory as recursive manner
async function uploadDirectory(dirPath, s3KeyPrefix, producer, maxConcurrent = MAX_CONCURRENT_UPLOADS) {
    const files = [];
    // Directories to exclude from upload
    const excludeDirs = ['node_modules', '.git', '.github', '.vscode', 'coverage'];

    //getting all files recursively
    function getAllFiles(dir, baseDir = '') {
        //first read the directory
        const entries = fs.readdirSync(dir);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const relativePath = path.join(baseDir, entry);
            
            // Skip excluded directories
            if (fs.lstatSync(fullPath).isDirectory()) {
                // Skip directories in the exclude list
                if (excludeDirs.includes(entry)) {
                    console.log(`Skipping excluded directory: ${fullPath}`);
                    continue;
                }
                getAllFiles(fullPath, relativePath);
            }
            else {
                files.push(
                    {
                        filePath: fullPath,
                        relativePath: relativePath,
                    }
                );
            }
        }
    }
    
    //initial call for directory
    getAllFiles(dirPath);
    publishLog(`Found ${files.length} files to upload in ${dirPath}`, producer, 'info');

    // Skip if no files found
    if (files.length === 0) {
        publishLog(`No files to upload in ${dirPath}`, producer, 'warning');
        return true;
    }

    //start uploading files in batches for better performance
    const results = [];
    for (let i = 0; i < files.length; i += maxConcurrent) {
        const batch = files.slice(i, i + maxConcurrent);
        const batchPromises = batch.map(file => {
            // Use the same key structure for all files to match your previous working approach
            const s3Key = `${s3KeyPrefix}/${file.relativePath.replace(/\\/g, '/')}`;
            return uploadToS3(file.filePath, s3Key, producer);
        });
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    const successCount = results.filter(r => r).length;
    publishLog(`Uploaded ${successCount}/${files.length} files from ${dirPath}`,
        producer,
        successCount === files.length ? 'success' : 'warning'
    );

    return successCount === files.length;
}


//helper function to detect output dir
function detectBuildFolder(projectDir) {
    const possibleFolders = ['build', 'dist', '.next', 'out', 'public']; // Common build folders
    for (const folder of possibleFolders) {
        const fullPath = path.join(projectDir, folder);
        console.log('Checking folder:', fullPath);

        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
            return fullPath;
        }
    }
    return null; // No build folder found
}



// Main function
async function init() {
    // Get Kafka broker from SSM if not provided in environment
    let kafkaBroker = process.env.KAFKA_BROKER;
    if (!kafkaBroker) {
        console.log("No Kafka broker found in environment, attempting to fetch from SSM...");
        kafkaBroker = await getKafkaBroker();
        if (!kafkaBroker) {
            console.error("Failed to get Kafka broker information. Exiting.");
            process.exit(1);
        }
    }

    const kafka = new Kafka({
        clientId: `docker-build-server-${DEPLOYMENT_ID}`,
        brokers: [kafkaBroker],
    });
    // Kafka producer setup
    const producer = kafka.producer();

    await producer.connect();
    console.log("Producer connection successful, will be able to publish logs.");
    // return; //for debug
    console.log("Executing script.js...");
    publishLog('Build Started...', producer, 'info');

    const projectDir = path.join(__dirname, 'output');

    // Update package.json homepage for React apps
    updatePackageJsonHomepage(projectDir);
    publishLog('Updated package.json with correct homepage path', producer, 'info');

    // Update vite.config.js for Vite-based apps
    updateViteConfig(projectDir);
    publishLog('Updated vite.config.js with correct base path', producer, 'info');

    // Get build command from environment variable
    const buildCommand = process.env.BUILD_COMMAND || 'npm install && npm run build'; // Default if not set
    console.log(`Executing build command: ${buildCommand}`);
    publishLog(`Executing build command: ${buildCommand}`, producer, 'info');
    // Create process instance
    const processInstance = exec(`cd ${projectDir} && ${buildCommand}`);

    processInstance.on('data', function (data) {
        console.log(data.toString());
        publishLog(data.toString(), producer, 'info');
    });

    processInstance.on('error', function (data) {
        console.log('Error: ' + data.toString());
        publishLog(`Error: ${data.toString()}`, producer, 'error');
    });

    processInstance.on('close', async function () {
        console.log("Build completed successfully!");
        publishLog('Build Complete', producer, 'success');
        // List the contents of the projectDir for debugging
        const filesInProjectDir = fs.readdirSync(projectDir);
        console.log('Contents of projectDir:', filesInProjectDir);
        // Upload built files to S3
        const buildFolder = detectBuildFolder(projectDir);
        if (!buildFolder) {
            console.error("Error: No valid build folder detected.");
            publishLog("Error: No valid build folder detected.", producer, 'error');
            process.exit(1);
        }
        console.log(`Detected build folder: ${buildFolder}`);
        publishLog(`Detected build folder: ${buildFolder}`, producer, 'info');

        //first start uploading buld files
        publishLog('Starting to upload build files...', producer, 'info');
        const buildSuccess = await uploadDirectory(
            buildFolder,
            `__outputs/${PROJECT_ID}`,  // Removed "/build" to match the structure in your previous working code
            producer
        );

        // Upload user code (source files)
        publishLog('Starting to upload user code...', producer, 'info');
        const userCodeSuccess = await uploadDirectory(
            projectDir,
            `__outputs/${PROJECT_ID}/source`,
            producer
        );

        if (buildSuccess && userCodeSuccess) {
            console.log('All files uploaded successfully!');
            publishLog('All files uploaded successfully!', producer, 'success');
        } else {
            console.log('Some files failed to upload.');
            publishLog('Some files failed to upload.', producer, 'warning');
        }

        process.exit(buildSuccess && userCodeSuccess ? 0 : 1);
    });
}

init();
