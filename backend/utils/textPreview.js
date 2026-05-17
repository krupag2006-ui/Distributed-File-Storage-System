const zlib = require('zlib');

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.md',
  '.log',
  '.sql'
]);

const normalizeText = (text) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extensionOf = (fileName = '') => {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
};

const isTextLike = ({ contentType = '', fileName = '' }) => {
  const normalizedType = contentType.toLowerCase();
  return normalizedType.startsWith('text/') || TEXT_EXTENSIONS.has(extensionOf(fileName));
};

const decodePdfLiteral = (value) =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));

const decodeHexString = (value) => {
  const clean = value.replace(/\s+/g, '');
  const bytes = [];

  for (let index = 0; index < clean.length - 1; index += 2) {
    bytes.push(Number.parseInt(clean.slice(index, index + 2), 16));
  }

  return Buffer.from(bytes).toString('utf8');
};

const extractPdfStrings = (source) => {
  const values = [];
  const literalPattern = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  const arrayPattern = /\[(.*?)\]\s*TJ/gs;
  const hexPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;

  for (const match of source.matchAll(literalPattern)) {
    values.push(decodePdfLiteral(match[0].replace(/\s*Tj$/, '').slice(1, -1)));
  }

  for (const match of source.matchAll(arrayPattern)) {
    const segment = match[1];
    for (const literal of segment.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
      values.push(decodePdfLiteral(literal[0].slice(1, -1)));
    }
    for (const hex of segment.matchAll(/<([0-9a-fA-F\s]+)>/g)) {
      values.push(decodeHexString(hex[1]));
    }
  }

  for (const match of source.matchAll(hexPattern)) {
    values.push(decodeHexString(match[1]));
  }

  return values.join(' ');
};

const inflatePdfStream = (streamBuffer) => {
  const attempts = [
    () => zlib.inflateSync(streamBuffer),
    () => zlib.inflateRawSync(streamBuffer),
    () => zlib.unzipSync(streamBuffer)
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (error) {
      continue;
    }
  }

  return null;
};

const extractPdfText = (buffer) => {
  const raw = buffer.toString('latin1');
  const pieces = [extractPdfStrings(raw)];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

  for (const match of raw.matchAll(streamPattern)) {
    const streamBuffer = Buffer.from(match[1], 'latin1');
    const inflated = inflatePdfStream(streamBuffer);

    if (inflated) {
      pieces.push(extractPdfStrings(inflated.toString('latin1')));
      pieces.push(extractPdfStrings(inflated.toString('utf8')));
    }
  }

  return normalizeText(pieces.filter(Boolean).join('\n'));
};

const extractPrintableRuns = (buffer) => {
  const text = buffer.toString('latin1');
  const runs = text.match(/[A-Za-z0-9 .,;:'"!?()[\]{}_\-+/\\@#$%^&*=<>|~]{6,}/g) || [];
  return normalizeText(runs.join('\n'));
};

const buildTextPreview = ({ buffer, contentType, fileName, maxChars = 8000 }) => {
  let mode = 'binary';
  let text = '';

  if (isTextLike({ contentType, fileName })) {
    mode = 'text';
    text = normalizeText(buffer.toString('utf8'));
  } else if (contentType?.toLowerCase().includes('pdf') || extensionOf(fileName) === '.pdf') {
    mode = 'pdf';
    text = extractPdfText(buffer);
  }

  if (!text) {
    text = extractPrintableRuns(buffer);
  }

  if (!text) {
    return {
      mode,
      text: 'No readable text was found in this chunk. This chunk may contain compressed binary data, images, fonts, or partial document structure.',
      truncated: false
    };
  }

  return {
    mode,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars
  };
};

module.exports = {
  buildTextPreview
};
