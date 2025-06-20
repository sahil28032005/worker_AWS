#!/bin/sh

# Check if the GIT_URI environment variable is set
if [ -z "$GIT_URI" ]; then
  echo "Error: GIT_URI environment variable is not set."
  exit 1
fi

# Define the output directory where the repo will be cloned (inside /app/output)
OUTPUT_DIR="output"

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Clone the Git repository into the output directory
echo "Cloning repository from $GIT_URI into $OUTPUT_DIR..."
git clone "$GIT_URI" "$OUTPUT_DIR"

# Check if git clone was successful
if [ $? -eq 0 ]; then
  echo "Repository cloned successfully!"
else
  echo "Error: Failed to clone the repository."
  exit 1
fi


# Optional: List the contents of the output directory to verify
echo "Contents of $OUTPUT_DIR:"
ls -la "$OUTPUT_DIR"

# Run the Node.js build script after cloning
echo "Running the build script..."
node ./script.js

# Signal successful completion
echo "All tasks completed. Exiting ECS container."
exit 0
# tail -f /dev/null
