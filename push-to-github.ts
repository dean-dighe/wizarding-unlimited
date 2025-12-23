import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) throw new Error('X_REPLIT_TOKEN not found');

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!accessToken) throw new Error('GitHub not connected');
  return accessToken;
}

// Get all files recursively, excluding certain directories
function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const excludeDirs = ['node_modules', '.git', '.upm', '.cache', 'dist', '.config'];
  const files: string[] = [];
  
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        files.push(...getAllFiles(fullPath, baseDir));
      }
    } else {
      // Skip binary files and large files
      const stats = fs.statSync(fullPath);
      if (stats.size < 500000) { // Skip files > 500KB
        files.push(relativePath);
      }
    }
  }
  return files;
}

async function pushToGitHub() {
  const accessToken = await getAccessToken();
  const octokit = new Octokit({ auth: accessToken });
  
  const owner = 'dean-dighe';
  const repo = 'wizarding-unlimited';
  const branch = 'main';
  
  console.log('Getting file list...');
  const files = getAllFiles('.');
  console.log(`Found ${files.length} files to push`);
  
  // Create blobs for each file
  const tree: any[] = [];
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath);
      const isText = !content.includes(0x00); // Simple binary check
      
      const blob = await octokit.rest.git.createBlob({
        owner, repo,
        content: content.toString('base64'),
        encoding: 'base64'
      });
      
      tree.push({
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha
      });
      
      console.log(`  Uploaded: ${filePath}`);
    } catch (err: any) {
      console.log(`  Skipped: ${filePath} (${err.message})`);
    }
  }
  
  console.log('\nCreating tree...');
  const treeResponse = await octokit.rest.git.createTree({
    owner, repo,
    tree
  });
  
  console.log('Creating commit...');
  const commitResponse = await octokit.rest.git.createCommit({
    owner, repo,
    message: 'Initial commit from Replit - Hogwarts Unlimited',
    tree: treeResponse.data.sha,
    parents: []
  });
  
  console.log('Updating branch reference...');
  try {
    await octokit.rest.git.updateRef({
      owner, repo,
      ref: 'heads/' + branch,
      sha: commitResponse.data.sha,
      force: true
    });
  } catch {
    // Branch doesn't exist, create it
    await octokit.rest.git.createRef({
      owner, repo,
      ref: 'refs/heads/' + branch,
      sha: commitResponse.data.sha
    });
  }
  
  console.log('\n✓ Successfully pushed to GitHub!');
  console.log(`  https://github.com/${owner}/${repo}`);
}

pushToGitHub().catch(console.error);
