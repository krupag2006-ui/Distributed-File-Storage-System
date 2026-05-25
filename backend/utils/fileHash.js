const crypto = require('crypto');

const calculateSha256 = (buffer) => {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
};

module.exports = {
  calculateSha256
};
