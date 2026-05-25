const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
      }
    : undefined;

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials
});

module.exports = {
  s3Client,
  bucketName: process.env.AWS_S3_BUCKET
};
