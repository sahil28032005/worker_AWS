# Jenkins Setup Guide for AWS Worker Deployment

## Prerequisites
- Jenkins server installed and running
- Docker installed on Jenkins server
- AWS account with proper permissions
- Kafka cluster accessible from Jenkins

## Initial Jenkins Setup

1. **Install Required Jenkins Plugins**
   - Go to "Manage Jenkins" > "Manage Plugins" > "Available"
   - Search and install:
     - Docker Pipeline
     - Pipeline
     - AWS Credentials
     - Credentials Binding

2. **Configure Credentials in Jenkins**
   - Go to "Manage Jenkins" > "Manage Credentials" > "Jenkins" > "Global credentials" > "Add Credentials"
   - Add the following credentials:
     - AWS_REGION (Secret text)
     - AWS_ACCESSKEY (Secret text)
     - AWS_SECRETACCESSKEY (Secret text)
     - S3_BUCKET_NAME (Secret text)
     - KAFKA_BROKER (Secret text)

## Creating a Jenkins Pipeline

1. **Create a New Pipeline Job**
   - Click "New Item" on the Jenkins dashboard
   - Enter a name (e.g., "aws-worker-deployment")
   - Select "Pipeline" and click "OK"

2. **Configure Pipeline**
   - In the "Pipeline" section, select "Pipeline script from SCM"
   - Select "Git" as SCM
   - Enter your repository URL
   - Specify branch (e.g., "*/main")
   - Script Path: "Jenkinsfile"
   - Save the configuration

## Understanding the Pipeline

The Jenkinsfile in this repository defines a complete CI/CD pipeline:

1. **Checkout**: Retrieves code from your Git repository
2. **Install Dependencies**: Installs Node.js dependencies
3. **Lint**: Checks code quality
4. **Test**: Runs unit tests if available
5. **Build Docker Image**: Creates a Docker image using Dockerfile.builder
6. **Run Integration Test**: Tests the Docker image with simulated environment
7. **Deploy**: Deploys the application when on the main branch

## Monitoring and Troubleshooting

1. **View Build Logs**
   - Click on a build number in the job's build history
   - Click "Console Output" to view detailed logs

2. **Jenkins Dashboard Widgets**
   - Add "Build Monitor View" for visual status of jobs
   - Install "Build Timeline" plugin for timeline visualization

3. **Setting Up Notifications**
   - Install "Email Extension" plugin
   - Configure email notifications in Jenkinsfile post section
   - Or use Slack/Teams integration plugins

## Best Practices

1. **Security**
   - Use credential bindings instead of hardcoded values
   - Regularly rotate AWS credentials
   - Use Jenkins role-based access control

2. **Performance**
   - Use Jenkins agents to distribute build load
   - Clean workspace after builds
   - Configure proper timeouts for each stage

3. **Maintenance**
   - Regularly update Jenkins and plugins
   - Archive old builds to save disk space
   - Backup Jenkins configuration

## Advanced Configuration

1. **Parameterized Builds**
   - Add parameters to customize builds (environment, features, etc.)

2. **Multi-branch Pipeline**
   - Set up multi-branch pipeline for PR validation

3. **Integration with AWS Services**
   - Configure AWS CodeDeploy for production deployments
   - Set up CloudWatch alarms for monitoring

4. **Automated Scaling**
   - Integrate with Kubernetes for dynamic agent provisioning 