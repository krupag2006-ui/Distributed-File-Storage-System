const path = require('path');
const AdmZip = require('adm-zip');
const { extractPdfText } = require('./extractPDF');
const { extractDocxText } = require('./extractDOCX');
const { extractPptxText } = require('./extractPPTX');

const READABLE_EXTENSIONS = new Set([
  '.txt',
  '.js',
  '.java',
  '.py',
  '.html',
  '.css',
  '.json',
  '.md',
  '.xml',
  '.csv',
  '.tsv',
  '.log'
]);

const LANGUAGE_BY_EXTENSION = {
  '.css': 'css',
  '.csv': 'text',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.log': 'text',
  '.md': 'markdown',
  '.py': 'python',
  '.tsv': 'text',
  '.txt': 'text',
  '.xml': 'xml'
};

const NO_READABLE_TEXT = 'No readable text content found for this chunk.';
const BINARY_PREVIEW_TEXT = 'Raw binary chunk content is hidden. Use Download Chunk for this stored chunk or Download Full File for reconstruction.';
const DEFAULT_STORED_PREVIEW_CHARS = Number(process.env.MAX_STORED_PREVIEW_CHARS || 750000);

const extensionOf = (fileName = '') => path.extname(fileName).toLowerCase();

const languageOf = (fileName = '') => LANGUAGE_BY_EXTENSION[extensionOf(fileName)] || 'text';

const normalizeText = (text = '') =>
  String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const truncateText = (text, maxChars) => ({
  text: text.slice(0, maxChars),
  truncated: text.length > maxChars
});

const emptyPreview = (message = NO_READABLE_TEXT) => ({
  mode: 'empty',
  language: 'text',
  sourceFiles: [],
  text: message,
  truncated: false,
  hasReadableText: false
});

const binaryPreview = () => ({
  mode: 'binary',
  language: 'text',
  sourceFiles: [],
  text: '',
  message: BINARY_PREVIEW_TEXT,
  truncated: false,
  hasReadableText: false
});

const isPdfDocument = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  return extensionOf(fileName) === '.pdf' || normalizedType.includes('pdf');
};

const isDocxDocument = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  return extensionOf(fileName) === '.docx' || normalizedType.includes('wordprocessingml');
};

const isPptxDocument = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  return extensionOf(fileName) === '.pptx' || normalizedType.includes('presentationml');
};

const isDocument = (file) =>
  isPdfDocument(file) || isDocxDocument(file) || isPptxDocument(file);

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

const chunkTextWindow = ({ text, sourceRanges = [], chunkIndex, chunkCount }) => {
  const normalizedText = normalizeText(text);
  const count = Number(chunkCount);
  const index = Number(chunkIndex);

  if (!normalizedText) {
    return {
      text: '',
      sourceFiles: [],
      partial: false
    };
  }

  if (!Number.isInteger(count) || count <= 1 || !Number.isInteger(index)) {
    return {
      text: normalizedText,
      sourceFiles: sourceRanges.map((source) => source.fileName).filter(Boolean),
      partial: false
    };
  }

  const zeroBasedIndex = Math.max(0, Math.min(count - 1, index > 0 ? index - 1 : index));
  const start = Math.floor((normalizedText.length * zeroBasedIndex) / count);
  const end = zeroBasedIndex === count - 1
    ? normalizedText.length
    : Math.floor((normalizedText.length * (zeroBasedIndex + 1)) / count);
  const windowText = normalizeText(normalizedText.slice(start, end));
  const sourceFiles = sourceRanges
    .filter((source) => source.end > start && source.start < end)
    .map((source) => source.fileName)
    .filter(Boolean);

  return {
    text: windowText,
    sourceFiles,
    partial: start > 0 || end < normalizedText.length
  };
};

const readableZipEntries = (zip) =>
  zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && READABLE_EXTENSIONS.has(extensionOf(entry.entryName)))
    .sort((first, second) => first.entryName.localeCompare(second.entryName));

const extractZipReadableText = (buffer) => {
  let zip;

  try {
    zip = new AdmZip(buffer);
  } catch (error) {
    return {
      text: '',
      sourceRanges: []
    };
  }

  const sections = [];
  const sourceRanges = [];
  const fileEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .sort((first, second) => first.entryName.localeCompare(second.entryName));
  let totalLength = 0;

  for (const entry of fileEntries.filter((item) => READABLE_EXTENSIONS.has(extensionOf(item.entryName)))) {
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

  const readableText = normalizeText(sections.join('\n\n'));

  if (readableText) {
    return {
      text: readableText,
      sourceRanges
    };
  }

  const fileList = fileEntries
    .map((entry) => `- ${entry.entryName} (${entry.header?.size || entry.getData().length || 0} bytes)`)
    .join('\n');

  return {
    text: fileList ? `Archive contents:\n${fileList}` : '',
    sourceRanges: fileEntries.map((entry) => ({
      fileName: entry.entryName,
      start: 0,
      end: fileList.length
    }))
  };
};

const extractDocumentText = async ({ buffer, fileName, contentType }) => {
  if (isPdfDocument({ contentType, fileName })) {
    const result = await extractPdfText(buffer);
    return {
      mode: 'pdf',
      text: result.success ? normalizeText(result.text) : '',
      sourceFiles: [fileName].filter(Boolean)
    };
  }

  if (isDocxDocument({ contentType, fileName })) {
    const result = await extractDocxText(buffer);
    return {
      mode: 'docx',
      text: result.success ? normalizeText(result.text) : '',
      sourceFiles: [fileName].filter(Boolean)
    };
  }

  if (isPptxDocument({ contentType, fileName })) {
    const result = await extractPptxText(buffer);
    return {
      mode: 'pptx',
      text: result.success ? normalizeText(result.text) : '',
      sourceFiles: [fileName].filter(Boolean)
    };
  }

  return {
    mode: 'document',
    text: '',
    sourceFiles: []
  };
};

const buildStoredFilePreview = async ({
  buffer,
  contentType = '',
  fileName = '',
  maxChars = DEFAULT_STORED_PREVIEW_CHARS
}) => {
  try {
    let mode = 'text';
    let language = languageOf(fileName);
    let sourceFiles = [fileName].filter(Boolean);
    let extractedText = '';
    let sourceRanges = [];

    if (isDocument({ contentType, fileName })) {
      const documentResult = await extractDocumentText({ buffer, fileName, contentType });
      mode = documentResult.mode;
      language = 'text';
      sourceFiles = documentResult.sourceFiles;
      extractedText = documentResult.text;
      sourceRanges = sourceFiles.map((sourceFile) => ({
        fileName: sourceFile,
        start: 0,
        end: extractedText.length
      }));
    } else if (isZipArchive({ contentType, fileName })) {
      const zipResult = extractZipReadableText(buffer);
      mode = 'zip-text';
      language = zipResult.sourceRanges.length === 1 ? languageOf(zipResult.sourceRanges[0].fileName) : 'text';
      sourceFiles = zipResult.sourceRanges.map((source) => source.fileName);
      extractedText = zipResult.text;
      sourceRanges = zipResult.sourceRanges;
    } else if (isTextLike({ contentType, fileName })) {
      extractedText = normalizeText(buffer.toString('utf8'));
      sourceRanges = sourceFiles.map((sourceFile) => ({
        fileName: sourceFile,
        start: 0,
        end: extractedText.length
      }));
    }

    if (!extractedText) {
      return emptyPreview();
    }

    const truncated = truncateText(extractedText, maxChars);

    return {
      mode,
      language,
      sourceFiles,
      sourceRanges,
      text: truncated.text,
      truncated: truncated.truncated,
      hasReadableText: true
    };
  } catch (error) {
    return emptyPreview();
  }
};

const buildChunkPreviewFromStoredText = ({
  previewText,
  previewMode = 'text',
  fileName = '',
  chunkIndex,
  chunkCount,
  maxChars = 12000
}) => {
  const normalizedPreview = normalizeText(previewText);

  if (!normalizedPreview) {
    return emptyPreview();
  }

  const window = chunkTextWindow({
    text: normalizedPreview,
    sourceRanges: [{
      fileName,
      start: 0,
      end: normalizedPreview.length
    }],
    chunkIndex,
    chunkCount
  });

  if (!window.text) {
    return emptyPreview();
  }

  const truncated = truncateText(window.text, maxChars);

  return {
    mode: previewMode || 'text',
    language: languageOf(fileName),
    sourceFiles: window.sourceFiles.length ? window.sourceFiles : [fileName].filter(Boolean),
    text: truncated.text,
    truncated: truncated.truncated || window.partial,
    hasReadableText: true
  };
};

const buildDirectChunkPreview = async ({
  buffer,
  contentType = '',
  fileName = '',
  maxChars = 12000
}) => {
  if (!isTextLike({ contentType, fileName })) {
    return binaryPreview();
  }

  const text = normalizeText(buffer.toString('utf8'));

  if (!text) {
    return emptyPreview();
  }

  return {
    mode: 'text',
    language: languageOf(fileName),
    sourceFiles: [fileName].filter(Boolean),
    ...truncateText(text, maxChars),
    hasReadableText: true
  };
};

module.exports = {
  BINARY_PREVIEW_TEXT,
  NO_READABLE_TEXT,
  buildChunkPreviewFromStoredText,
  buildDirectChunkPreview,
  buildStoredFilePreview,
  isDocument,
  isDocxDocument,
  isPdfDocument,
  isPptxDocument,
  isTextLike,
  isZipArchive
};
