const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
require('dotenv').config();

// Environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'user-build-codes';
const AWS_REGION = process.env.AWS_REGION;

// S3 client configuration
const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESSKEY,
        secretAccessKey: process.env.AWS_SECRETACCESSKEY
    }
});

// Function to verify S3 deployment
async function verifyS3Deployment() {
    console.log(`Verifying S3 deployment for project ${PROJECT_ID}...`);
    
    try {
        // Check if the project folder exists in S3
        const listCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET_NAME,
            Prefix: `__outputs/${PROJECT_ID}/`,
            MaxKeys: 10
        });
        
        const response = await s3Client.send(listCommand);
        
        if (!response.Contents || response.Contents.length === 0) {
            console.error(`No files found in S3 for project ${PROJECT_ID}`);
            return false;
        }
        
        console.log(`Found ${response.Contents.length} files in S3 (showing first 10)`);
        response.Contents.forEach(item => {
            console.log(`- ${item.Key} (${item.Size} bytes, last modified: ${item.LastModified})`);
        });
        
        // Check for index.html in the build output
        const indexKey = `__outputs/${PROJECT_ID}/index.html`;
        try {
            const getCommand = new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: indexKey
            });
            
            await s3Client.send(getCommand);
            console.log(`Successfully verified index.html exists`);
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                console.warn(`Warning: index.html not found at ${indexKey}`);
                // This might not be a critical error for all project types
            } else {
                throw error;
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error verifying S3 deployment:', error);
        return false;
    }
}

// Function to check if the deployed app is accessible (if applicable)
async function checkAppAccessibility() {
    // This would be customized based on your deployment setup
    // For example, if you have a CloudFront distribution or direct S3 website URL
    const appUrl = process.env.DEPLOYED_APP_URL;
    
    if (!appUrl) {
        console.log('No DEPLOYED_APP_URL provided, skipping accessibility check');
        return true; // Skip this check if no URL provided
    }
    
    try {
        console.log(`Checking if app is accessible at ${appUrl}`);
        const response = await axios.get(appUrl, { 
            timeout: 10000,
            validateStatus: null // Accept any status code
        });
        
        if (response.status >= 200 && response.status < 400) {
            console.log(`App is accessible, status code: ${response.status}`);
            return true;
        } else {
            console.error(`App returned error status code: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error('Error checking app accessibility:', error.message);
        return false;
    }
}

// Function to verify source code upload
async function verifySourceCodeUpload() {
    console.log('Verifying source code upload...');
    
    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET_NAME,
            Prefix: `__outputs/${PROJECT_ID}/source/`,
            MaxKeys: 5
        });
        
        const response = await s3Client.send(listCommand);
        
        if (!response.Contents || response.Contents.length === 0) {
            console.error('No source files found in S3');
            return false;
        }
        
        console.log(`Found ${response.Contents.length} source files in S3 (showing first 5)`);
        response.Contents.forEach(item => {
            console.log(`- ${item.Key}`);
        });
        
        return true;
    } catch (error) {
        console.error('Error verifying source code upload:', error);
        return false;
    }
}

// Main verification function
async function verifyDeployment() {
    try {
        console.log('Starting deployment verification...');
        
        // Check S3 deployment
        const s3Verified = await verifyS3Deployment();
        if (!s3Verified) {
            console.error('S3 deployment verification failed');
            process.exit(1);
        }
        
        // Check source code upload
        const sourceVerified = await verifySourceCodeUpload();
        if (!sourceVerified) {
            console.error('Source code upload verification failed');
            process.exit(1);
        }
        
        // Check app accessibility
        const accessibilityVerified = await checkAppAccessibility();
        if (!accessibilityVerified) {
            console.error('App accessibility verification failed');
            process.exit(1);
        }
        
        console.log('All verification checks passed!');
        process.exit(0);
    } catch (error) {
        console.error('Deployment verification failed with error:', error);
        process.exit(1);
    }
}

// Run the verification
verifyDeployment(); 