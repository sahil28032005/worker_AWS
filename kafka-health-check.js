const { Kafka } = require('kafkajs');
require('dotenv').config();

// Get environment variables
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const PROJECT_ID = process.env.PROJECT_ID || 'test-project';
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID || 'test-deployment';

// SSM client configuration if needed
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const ssmClient = new SSMClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESSKEY,
        secretAccessKey: process.env.AWS_SECRETACCESSKEY
    }
});

// Function to get Kafka broker from SSM if not in environment
async function getKafkaBroker() {
    if (KAFKA_BROKER) {
        return KAFKA_BROKER;
    }

    const params = {
        Name: 'KAFKA_BROKER',
        WithDecryption: true
    };

    try {
        const command = new GetParameterCommand(params);
        const response = await ssmClient.send(command);
        return response.Parameter.Value;
    } catch (e) {
        console.error('Error getting Kafka broker information:', e);
        process.exit(1);
    }
}

// Function to check if Kafka is reachable
async function checkKafkaConnection(broker) {
    console.log(`Checking Kafka connection to ${broker}...`);
    
    const kafka = new Kafka({
        clientId: `health-check-${DEPLOYMENT_ID}`,
        brokers: [broker],
        connectionTimeout: 5000, // 5 seconds timeout
        retry: {
            initialRetryTime: 300,
            retries: 3
        }
    });

    const admin = kafka.admin();
    
    try {
        // Try to connect
        await admin.connect();
        console.log('Successfully connected to Kafka');
        
        // List topics to verify further functionality
        const topics = await admin.listTopics();
        console.log(`Available topics: ${topics.join(', ')}`);
        
        // Check if our required topic exists
        const requiredTopic = 'builder-logs';
        if (!topics.includes(requiredTopic)) {
            console.warn(`Warning: Required topic '${requiredTopic}' does not exist`);
        } else {
            console.log(`Required topic '${requiredTopic}' exists`);
        }
        
        await admin.disconnect();
        return true;
    } catch (error) {
        console.error('Failed to connect to Kafka:', error);
        return false;
    }
}

// Function to test message production
async function testMessageProduction(broker) {
    console.log('Testing message production...');
    
    const kafka = new Kafka({
        clientId: `health-check-producer-${DEPLOYMENT_ID}`,
        brokers: [broker],
    });
    
    const producer = kafka.producer();
    const testTopic = 'health-check-topic';
    
    try {
        await producer.connect();
        
        // Send a test message
        const result = await producer.send({
            topic: testTopic,
            messages: [{
                key: 'health-check',
                value: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    message: 'Health check test message',
                    PROJECT_ID,
                    DEPLOYMENT_ID
                })
            }]
        });
        
        console.log('Test message sent successfully:', result);
        await producer.disconnect();
        return true;
    } catch (error) {
        console.error('Failed to produce test message:', error);
        return false;
    }
}

// Main function
async function main() {
    try {
        // Get Kafka broker
        const broker = await getKafkaBroker();
        if (!broker) {
            console.error('No Kafka broker available');
            process.exit(1);
        }
        
        // Check connection
        const connectionOk = await checkKafkaConnection(broker);
        if (!connectionOk) {
            console.error('Kafka connection check failed');
            process.exit(1);
        }
        
        // Test message production
        const productionOk = await testMessageProduction(broker);
        if (!productionOk) {
            console.error('Kafka message production test failed');
            process.exit(1);
        }
        
        console.log('All Kafka health checks passed!');
        process.exit(0);
    } catch (error) {
        console.error('Kafka health check failed with error:', error);
        process.exit(1);
    }
}

main(); 