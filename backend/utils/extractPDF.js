const pdfParse = require('pdf-parse');

const extractPdfText = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    return {
      success: true,
      text: text.trim(),
      pageCount: data.numpages || 0
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
  extractPdfText
};
