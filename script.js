const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
require('dotenv').config();
const { Kafka } = require('kafkajs');

//getting kafka broker information securely from managers \
async function getKafkaBroker() {
    const ssm = new AWS.SSM();
    const params = {
        Name: 'KAFKA_BROKER',
        WithDecryption: true
    };

    try {
        const data = await ssm.getParameter(params).promise();
        return data.Parameter.Value; // Kafka broker IP:port

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
async function uploadToS3(filePath, s3Key, producer) {
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
        Bucket: 'user-build-codes',
        Key: s3Key,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath) || 'application/octet-stream'
    });

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
        console.log('Error uploading file:', error.message);
        publishLog(`Error uploading ${path.basename(filePath)}: ${error.message}`, producer, 'error');
        return false;
    }
}

//helper function to upload directory as recursive manner
async function uploadDirectory(dirPath, s3KeyPrefix, producer, maxConcurrent = 5) {
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
        const batchPromises = batch.map(file => uploadToS3(
            file.filePath,
            `${s3KeyPrefix}/${file.relativePath.replace(/\\/g, '/')}`,
            producer
        ));
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
    const kafka = new Kafka({
        clientId: `docker-build-server-${DEPLOYMENT_ID}`,
        brokers: [`${process.env.KAFKA_BROKER}`],
    });
    // Kafka producer setup
    const producer = kafka.producer();

    await producer.connect();
    console.log("Producer connection successful, will be able to publish logs.");
    // return; //for debug
    console.log("Executing script.js...");
    publishLog('Build Started...', producer, 'info');

    const projectDir = path.join(__dirname, 'output');
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
            `__outputs/${PROJECT_ID}/build`,
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
