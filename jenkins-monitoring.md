# Jenkins Monitoring Guide for AWS Worker Deployment

## Setting Up Monitoring Dashboard

### Basic Monitoring
1. **Install Dashboard View Plugin**
   - Go to "Manage Jenkins" > "Manage Plugins" > "Available"
   - Search and install "Dashboard View" plugin
   - Create a new dashboard view for your AWS worker deployment

2. **Configure Build History Widget**
   - Add "Build History" widget to track recent builds
   - Configure to show last 10 builds with status indicators

3. **Set Up Build Statistics**
   - Install "Build Statistics" plugin
   - Add widget to dashboard to track build success/failure rates
   - Monitor build duration trends

### Advanced Monitoring

1. **Performance Monitoring**
   - Install "Performance Plugin"
   - Add performance testing stage to Jenkinsfile:
   ```groovy
   stage('Performance Test') {
       steps {
           sh 'npm run performance-test || echo "No performance tests configured"'
           perfReport 'performance-reports/*.xml'
       }
   }
   ```

2. **AWS Resource Monitoring**
   - Install "AWS CloudWatch Monitoring" plugin
   - Configure to monitor:
     - S3 bucket usage
     - Lambda function invocations (if used)
     - EC2 instance metrics (if applicable)

3. **Kafka Monitoring**
   - Add Kafka monitoring stage:
   ```groovy
   stage('Kafka Health Check') {
       steps {
           sh 'node kafka-health-check.js'
       }
   }
   ```

## Setting Up Alerts

1. **Email Notifications**
   - Configure in Jenkinsfile:
   ```groovy
   post {
       failure {
           emailext (
               subject: "Build Failed: ${currentBuild.fullDisplayName}",
               body: "Build failed. Check console output at ${env.BUILD_URL}",
               recipientProviders: [[$class: 'DevelopersRecipientProvider']]
           )
       }
   }
   ```

2. **Slack/Teams Notifications**
   - Install appropriate plugin (Slack Notification or Office 365 Connector)
   - Configure in Jenkinsfile:
   ```groovy
   post {
       success {
           slackSend channel: '#deployments', 
                     color: 'good', 
                     message: "Deployment Successful: ${env.JOB_NAME} ${env.BUILD_NUMBER}"
       }
       failure {
           slackSend channel: '#deployments', 
                     color: 'danger', 
                     message: "Deployment Failed: ${env.JOB_NAME} ${env.BUILD_NUMBER}"
       }
   }
   ```

3. **Threshold-Based Alerts**
   - Install "Warning Next Generation" plugin
   - Configure thresholds for test failures, build time, etc.

## Continuous Monitoring

1. **Health Check Jobs**
   - Create a separate Jenkins job that runs periodically:
   ```groovy
   pipeline {
       agent any
       triggers {
           cron('*/30 * * * *') // Run every 30 minutes
       }
       stages {
           stage('Health Check') {
               steps {
                   sh 'curl -f https://your-deployment-endpoint/health || exit 1'
               }
           }
       }
       post {
           failure {
               slackSend channel: '#alerts', 
                         color: 'danger', 
                         message: "Health check failed!"
           }
       }
   }
   ```

2. **Log Analysis**
   - Install "Log Parser" plugin
   - Configure to scan for error patterns in build logs
   - Set up alerts for critical error patterns

3. **Deployment Verification**
   - Add post-deployment verification stage:
   ```groovy
   stage('Verify Deployment') {
       steps {
           sh '''
               # Wait for deployment to stabilize
               sleep 30
               # Run verification tests
               node verify-deployment.js
           '''
       }
   }
   ```

## Reporting

1. **Build History Report**
   - Install "Build History Report" plugin
   - Configure weekly/monthly reports on build success rates

2. **Test Result Trend**
   - Configure JUnit test result collection:
   ```groovy
   stage('Test') {
       steps {
           sh 'npm test'
       }
       post {
           always {
               junit 'test-results/*.xml'
           }
       }
   }
   ```

3. **Custom Dashboard for Stakeholders**
   - Create a separate view with simplified metrics for management
   - Include only critical metrics and overall health indicators 