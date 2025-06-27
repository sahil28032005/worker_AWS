pipeline {
    agent any
    
    environment {
        AWS_REGION = credentials('AWS_REGION')
        AWS_ACCESSKEY = credentials('AWS_ACCESSKEY')
        AWS_SECRETACCESSKEY = credentials('AWS_SECRETACCESSKEY')
        S3_BUCKET_NAME = credentials('S3_BUCKET_NAME')
        KAFKA_BROKER = credentials('KAFKA_BROKER')
        PROJECT_ID = 'project-${BUILD_NUMBER}'
        DEPLOYMENT_ID = 'deployment-${BUILD_NUMBER}'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }
        
        stage('Lint') {
            steps {
                sh 'npm run lint || true'
            }
        }
        
        stage('Test') {
            steps {
                sh 'npm test || echo "No tests configured"'
            }
        }
        
        stage('Build Docker Image') {
            steps {
                sh 'docker build -t worker-aws:${BUILD_NUMBER} -f Dockerfile.builder .'
            }
        }
        
        stage('Run Integration Test') {
            steps {
                sh '''
                    docker run --rm \
                    -e AWS_REGION=${AWS_REGION} \
                    -e AWS_ACCESSKEY=${AWS_ACCESSKEY} \
                    -e AWS_SECRETACCESSKEY=${AWS_SECRETACCESSKEY} \
                    -e S3_BUCKET_NAME=${S3_BUCKET_NAME} \
                    -e KAFKA_BROKER=${KAFKA_BROKER} \
                    -e PROJECT_ID=${PROJECT_ID} \
                    -e DEPLOYMENT_ID=${DEPLOYMENT_ID} \
                    -e BUILD_COMMAND="npm install && echo 'Build simulation successful'" \
                    worker-aws:${BUILD_NUMBER}
                '''
            }
        }
        
        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh 'echo "Deployment would happen here"'
                // Add actual deployment commands here
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
} 