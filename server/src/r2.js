const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function isConfigured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

let client = null;

function getClient() {
  if (!isConfigured()) {
    throw new Error('R2 não configurado (faltam variáveis de ambiente).');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/** URL temporária para o app enviar a foto direto ao R2. */
async function presignUpload(key, contentType) {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    ContentType: contentType || 'image/jpeg',
  });
  return getSignedUrl(getClient(), command, { expiresIn: 600 });
}

/** URL temporária para o app baixar a foto. */
async function presignDownload(key) {
  const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

module.exports = { isConfigured, presignUpload, presignDownload };
