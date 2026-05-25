const AdmZip = require('adm-zip');

const decodeXmlEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));

const slideNumber = (entryName) => {
  const match = entryName.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const extractPptxText = async (buffer) => {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const slideEntries = entries.filter((entry) =>
      entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')
    ).sort((first, second) => slideNumber(first.entryName) - slideNumber(second.entryName));

    const textParts = [];
    let slideCount = 0;

    for (const slideEntry of slideEntries) {
      slideCount += 1;
      const xmlContent = zip.readAsText(slideEntry);

      try {
        // Extract text content using simple regex (faster than XML parsing for our use case)
        const textMatches = xmlContent.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
        const slideTexts = textMatches
          .map((match) =>
            decodeXmlEntities(
              match
                .replace(/<a:t[^>]*>/g, '')
                .replace(/<\/a:t>/g, '')
                .trim()
            )
          )
          .filter((text) => text);

        if (slideTexts.length > 0) {
          textParts.push(slideTexts.join(' '));
        }
      } catch (parseError) {
        // Continue with next slide if parsing fails
        continue;
      }
    }

    const text = textParts.join('\n\n');
    return {
      success: true,
      text: text.trim(),
      slideCount
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
  extractPptxText
};
