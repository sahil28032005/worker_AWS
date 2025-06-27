# AWS Worker Deployment with Jenkins Integration

This repository contains a Node.js application for deploying projects to AWS S3 with Kafka integration for logging. The setup includes complete Jenkins CI/CD pipeline integration.

## Project Overview

The worker handles:
- Building projects from source code
- Uploading build artifacts to AWS S3
- Uploading source code for reference
- Sending logs to Kafka

## Jenkins Integration

This project is fully integrated with Jenkins for CI/CD:

1. **Continuous Integration**: Automated testing and building of the worker
2. **Continuous Deployment**: Automated deployment to production
3. **Monitoring**: Health checks and performance monitoring

### Getting Started with Jenkins

1. Set up Jenkins with required plugins (see `jenkins-setup.md`)
2. Configure credentials in Jenkins for AWS and Kafka
3. Create a new pipeline job using the provided Jenkinsfile
4. Run the pipeline to build, test, and deploy

## Key Files

- `Jenkinsfile`: Defines the CI/CD pipeline
- `script.js`: Main worker script for building and deploying
- `kafka-health-check.js`: Script for verifying Kafka connectivity
- `verify-deployment.js`: Script for verifying successful deployments
- `jenkins-setup.md`: Detailed guide for setting up Jenkins
- `jenkins-monitoring.md`: Guide for monitoring the deployment with Jenkins

## Environment Variables

See `jenkins-env-sample.env` for required environment variables.

## Running Locally

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Copy environment variables
cp jenkins-env-sample.env .env

# Edit .env with your credentials
nano .env

# Run the script
node script.js
```

## Jenkins Pipeline Stages

1. **Checkout**: Retrieves the latest code
2. **Install Dependencies**: Installs Node.js packages
3. **Lint**: Checks code quality
4. **Test**: Runs unit tests
5. **Build Docker Image**: Creates a Docker image for deployment
6. **Run Integration Test**: Tests the Docker image
7. **Deploy**: Deploys to production (when on main branch)

## Monitoring

See `jenkins-monitoring.md` for detailed information on setting up monitoring dashboards and alerts.

## Troubleshooting

Common issues and solutions:

1. **Kafka Connection Issues**: Run `node kafka-health-check.js` to diagnose
2. **S3 Upload Failures**: Check AWS credentials and bucket permissions
3. **Build Failures**: Check the build command and project structure

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

[Your License Here] 