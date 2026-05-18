const path = require('path');
const AdmZip = require('adm-zip');

const READABLE_EXTENSIONS = new Set([
  '.txt',
  '.js',
  '.java',
  '.py',
  '.html',
  '.css',
  '.json',
  '.md',
  '.xml'
]);

const LANGUAGE_BY_EXTENSION = {
  '.css': 'css',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.py': 'python',
  '.txt': 'text',
  '.xml': 'xml'
};

const NO_READABLE_TEXT = 'No readable text content found in this chunk.';

const extensionOf = (fileName = '') => path.extname(fileName).toLowerCase();

const languageOf = (fileName = '') => LANGUAGE_BY_EXTENSION[extensionOf(fileName)] || 'text';

const normalizeText = (text) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .trim();

const truncateText = (text, maxChars) => ({
  text: text.slice(0, maxChars),
  truncated: text.length > maxChars
});

const chunkTextWindow = ({ text, sourceRanges, chunkIndex, chunkCount }) => {
  const count = Number(chunkCount);
  const index = Number(chunkIndex);

  if (!Number.isInteger(count) || count <= 1 || !Number.isInteger(index)) {
    return {
      text,
      sourceFiles: sourceRanges.map((source) => source.fileName),
      partial: false
    };
  }

  const zeroBasedIndex = Math.max(0, Math.min(count - 1, index > 0 ? index - 1 : index));
  const start = Math.floor((text.length * zeroBasedIndex) / count);
  const end = zeroBasedIndex === count - 1
    ? text.length
    : Math.floor((text.length * (zeroBasedIndex + 1)) / count);
  const windowText = text.slice(start, end).trim();
  const sourceFiles = sourceRanges
    .filter((source) => source.end > start && source.start < end)
    .map((source) => source.fileName);

  return {
    text: windowText,
    sourceFiles,
    partial: start > 0 || end < text.length
  };
};

const isTextLike = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  return normalizedType.startsWith('text/') || READABLE_EXTENSIONS.has(extensionOf(fileName));
};

const isZipArchive = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  return (
    extensionOf(fileName) === '.zip' ||
    normalizedType.includes('zip') ||
    normalizedType.includes('x-zip-compressed')
  );
};

const emptyPreview = () => ({
  mode: 'empty',
  language: 'text',
  sourceFiles: [],
  text: NO_READABLE_TEXT,
  truncated: false
});

const readableZipEntries = (zip) =>
  zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && READABLE_EXTENSIONS.has(extensionOf(entry.entryName)))
    .sort((first, second) => first.entryName.localeCompare(second.entryName));

const extractZipReadableText = ({ buffer, maxChars, chunkIndex, chunkCount }) => {
  let zip;

  try {
    zip = new AdmZip(buffer);
  } catch (error) {
    return emptyPreview();
  }

  const entries = readableZipEntries(zip);
  const sections = [];
  const sourceRanges = [];
  let totalLength = 0;

  for (const entry of entries) {
    let content = '';

    try {
      content = normalizeText(entry.getData().toString('utf8'));
    } catch (error) {
      continue;
    }

    if (!content) {
      continue;
    }

    const section = [`// ${entry.entryName}`, content].join('\n');
    const sectionStart = totalLength;
    const sectionEnd = sectionStart + section.length;
    sections.push(section);
    sourceRanges.push({
      fileName: entry.entryName,
      start: sectionStart,
      end: sectionEnd
    });
    totalLength += section.length + 2;
  }

  if (!sections.length) {
    return emptyPreview();
  }

  const combinedText = sections.join('\n\n');
  const window = chunkTextWindow({
    text: combinedText,
    sourceRanges,
    chunkIndex,
    chunkCount
  });

  if (!window.text) {
    return emptyPreview();
  }

  const truncated = truncateText(window.text, maxChars);

  return {
    mode: 'zip-text',
    language: window.sourceFiles.length === 1 ? languageOf(window.sourceFiles[0]) : 'text',
    sourceFiles: window.sourceFiles,
    text: truncated.text,
    truncated: truncated.truncated || window.partial
  };
};

const buildTextPreview = ({
  buffer,
  archiveBuffer,
  contentType = '',
  fileName = '',
  chunkIndex,
  chunkCount,
  maxChars = 12000
}) => {
  if (isTextLike({ contentType, fileName })) {
    const text = normalizeText(buffer.toString('utf8'));

    if (!text) {
      return emptyPreview();
    }

    return {
      mode: 'text',
      language: languageOf(fileName),
      sourceFiles: [fileName].filter(Boolean),
      ...truncateText(text, maxChars)
    };
  }

  if (isZipArchive({ contentType, fileName })) {
    return extractZipReadableText({
      buffer: archiveBuffer || buffer,
      chunkIndex,
      chunkCount,
      maxChars
    });
  }

  return emptyPreview();
};

module.exports = {
  NO_READABLE_TEXT,
  buildTextPreview,
  isTextLike,
  isZipArchive
};
