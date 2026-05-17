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

const extractZipReadableText = ({ buffer, maxChars }) => {
  let zip;

  try {
    zip = new AdmZip(buffer);
  } catch (error) {
    return emptyPreview();
  }

  const entries = readableZipEntries(zip);
  const sections = [];
  const sourceFiles = [];
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
    sections.push(section);
    sourceFiles.push(entry.entryName);
    totalLength += section.length + 2;

    if (totalLength >= maxChars) {
      break;
    }
  }

  if (!sections.length) {
    return emptyPreview();
  }

  const combinedText = sections.join('\n\n');
  const truncated = truncateText(combinedText, maxChars);

  return {
    mode: 'zip-text',
    language: sourceFiles.length === 1 ? languageOf(sourceFiles[0]) : 'text',
    sourceFiles,
    text: truncated.text,
    truncated: truncated.truncated || sourceFiles.length < entries.length
  };
};

const buildTextPreview = ({
  buffer,
  archiveBuffer,
  contentType = '',
  fileName = '',
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
