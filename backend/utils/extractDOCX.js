const mammoth = require('mammoth');

const extractDocxText = async (buffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    return {
      success: true,
      text: text.trim()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      text: ''
    };
  }
};

module.exports = {
  extractDocxText
};
