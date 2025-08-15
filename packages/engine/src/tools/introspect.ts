import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import ignoreWalk from 'ignore-walk';

/**
 * Find repo root based on current file location
 */
function getRootPath(): string {
  // Find repo root based on current file location
  const currentFile = fileURLToPath(import.meta.url);
  // Navigate up from packages/engine/src/tools/codebase-context.ts to repo root
  return path.resolve(path.dirname(currentFile), '../../../../');
}

/**
 * Check if a file is likely a text file based on extension
 */
function isTextFile(filePath: string): boolean {
  const textExtensions = new Set([
    '.ts',
    '.js',
    '.tsx',
    '.jsx',
    '.json',
    '.md',
    '.txt',
    '.yml',
    '.yaml',
    '.toml',
    '.xml',
    '.html',
    '.css',
    '.scss',
    '.less',
    '.sql',
    '.sh',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.php',
    '.swift',
    '.kt',
    '.scala',
    '.clj',
    '.hs',
    '.elm',
    '.vue',
    '.svelte',
    '.astro',
    '.config',
    '.env',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.prettierrc',
    '.eslintrc',
    '.babelrc',
    '.npmrc'
  ]);

  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Check extension
  if (textExtensions.has(ext)) {
    return true;
  }

  // Check common config files without extensions
  const configFiles = new Set([
    'Dockerfile',
    'Makefile',
    'Rakefile',
    'Gemfile',
    'Procfile',
    'LICENSE',
    'CHANGELOG',
    'CONTRIBUTING',
    'AUTHORS',
    'NOTICE'
  ]);

  return configFiles.has(basename);
}

/**
 * Read README.md contents
 */
async function getReadmeContents(): Promise<string> {
  try {
    const rootPath = getRootPath();
    const readmePath = path.join(rootPath, 'README.md');
    return await fs.readFile(readmePath, 'utf-8');
  } catch (error) {
    return `Error reading README.md: ${error}`;
  }
}

/**
 * Get file tree excluding gitignored files using ignore-walk
 */
async function getFileTree(): Promise<{
  directories: Record<string, string[]>;
  formattedTree: string;
}> {
  try {
    const rootPath = getRootPath();
    const files = await ignoreWalk({
      path: rootPath,
      ignoreFiles: ['.gitignore']
    });

    const grouped: Record<string, string[]> = {};

    for (const file of files) {
      const dir = path.dirname(file);
      const filename = path.basename(file);

      // Exclude anything in the .git dir and pnpm-lock.yaml
      if (dir.split('/')[0] === '.git') {
        continue;
      }
      if (filename === 'pnpm-lock.yaml') {
        continue;
      }

      if (!grouped[dir]) {
        grouped[dir] = [];
      }
      grouped[dir].push(filename);
    }

    for (const dir in grouped) {
      grouped[dir].sort();
    }

    const dirs = Object.keys(grouped).sort();

    const directories: Record<string, string[]> = {};
    let formattedTree = '<files>\n';
    for (const dir of dirs) {
      directories[dir] = grouped[dir];
      formattedTree += `${dir}:\n  ${grouped[dir].join('\n  ')}\n\n`;
    }
    formattedTree += `</files>
<note>
Some files intentionally excluded:
 - all gitignored files
 - .git directory
 - pnpm-lock.yaml
</note>
`;

    return {
      directories,
      formattedTree: formattedTree.trim()
    };
  } catch (error) {
    throw new Error(`Error walking directory: ${error}`);
  }
}

/**
 * Get all file contents for non-gitignored files
 */
async function getAllFileContents(): Promise<Record<string, string>> {
  const tree = await getFileTree();
  const fileContents: Record<string, string> = {};

  for (const dir in tree.directories) {
    for (const filename of tree.directories[dir]) {
      const file = path.join(dir, filename);
      if (isTextFile(file)) {
        try {
          const rootPath = getRootPath();
          const fullPath = path.join(rootPath, file);
          const content = await fs.readFile(fullPath, 'utf-8');
          fileContents[file] = content;
        } catch (error) {
          fileContents[file] = `Error reading file: ${error}`;
        }
      }
    }
  }

  return fileContents;
}

/**
 * Get overview: README.md contents + file tree
 */
async function getOverview(): Promise<string> {
  const [readme, tree] = await Promise.all([
    getReadmeContents(),
    getFileTree()
  ]);

  return `
<loom-engine-overview>
${tree.formattedTree}
<readme>
${readme}
</readme>
</loom-engine-overview>
  `;
}

/**
 * Get all: file tree + all file contents
 */
async function getAll(): Promise<string> {
  const [tree, fileContents] = await Promise.all([
    getFileTree(),
    getAllFileContents()
  ]);

  return `
<loom-engine-codebase>
${tree.formattedTree}

${Object.entries(fileContents)
  .map(
    ([file, content]) => `
<file path="${file}">
${content}
</file>
`
  )
  .join('\n')}
</loom-engine-codebase>
  `;
}

/**
 * Get codebase context at the specified level
 */
export async function getCodebaseContext(
  level: 'overview' | 'all'
): Promise<string> {
  if (level === 'overview') {
    return getOverview();
  } else if (level === 'all') {
    return getAll();
  } else {
    throw new Error(`Invalid level: ${level}`);
  }
}

// For testing: print to console if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const context = await getCodebaseContext(
      process.argv[2] === 'all' ? 'all' : 'overview'
    );
    console.log(context);
  })();
}
