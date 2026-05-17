const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabasePrimaryBucket = process.env.SUPABASE_PRIMARY_BUCKET || process.env.SUPABASE_BUCKET || 'chunks';
const supabaseReplicaBuckets = (process.env.SUPABASE_REPLICA_BUCKETS || '')
  .split(',')
  .map((bucket) => bucket.trim())
  .filter(Boolean);

const decodeJwtPayload = (token) => {
  if (!token) return null;

  try {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) return null;

    return JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf-8'));
  } catch (error) {
    return null;
  }
};

const supabaseRole = decodeJwtPayload(supabaseKey)?.role;

const requireSupabaseConfig = () => {
  if (!supabaseUrl || !supabaseKey || !supabasePrimaryBucket) {
    throw new Error(
      'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_PRIMARY_BUCKET must be configured. Set SUPABASE_REPLICA_BUCKETS for backup buckets.'
    );
  }
};

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabaseRole === 'anon') {
  console.warn(
    'SUPABASE_KEY is using the anon role. Server-side Storage uploads can fail with row-level security. Prefer SUPABASE_SERVICE_ROLE_KEY in backend/.env.'
  );
}

module.exports = {
  supabase,
  supabasePrimaryBucket,
  supabaseReplicaBuckets,
  requireSupabaseConfig
};
