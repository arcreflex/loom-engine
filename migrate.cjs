#!/usr/bin/env node

/**
 * Migration script to update existing roots.json to the new format
 * where RootConfig only contains systemPrompt (no provider/model)
 * and adds a default model to config.toml if not present.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to resolve ~ in paths
function resolveDataDir(dataDir) {
  if (dataDir.startsWith('~')) {
    return path.join(os.homedir(), dataDir.slice(1));
  }
  return dataDir;
}

function migrateRootsJson(dataDir) {
  const rootsPath = path.join(dataDir, 'roots.json');
  
  if (!fs.existsSync(rootsPath)) {
    console.log('No roots.json found, skipping migration');
    return;
  }

  console.log(`Migrating ${rootsPath}...`);
  
  try {
    const rootsData = JSON.parse(fs.readFileSync(rootsPath, 'utf8'));
    let rootsFileNeedsUpdate = false;
    let totalNodesUpdated = 0;
    let totalNodesBackedUp = 0;

    // rootsData should be an array of RootData objects
    if (!Array.isArray(rootsData)) {
      console.error('Expected roots.json to contain an array, but got:', typeof rootsData);
      return;
    }

    // Process each root
    for (const rootInfo of rootsData) {
      // Extract original provider and model before modifying config
      const originalProvider = rootInfo.config ? rootInfo.config.provider : null;
      const originalModelForRoot = rootInfo.config ? rootInfo.config.model : null;
      
      console.log(`Processing root ${rootInfo.id}...`);
      
      // Process nodes within this root if we have provider info
      if (originalProvider) {
        const nodesDirPath = path.join(dataDir, rootInfo.id, 'nodes');
        
        if (fs.existsSync(nodesDirPath)) {
          console.log(`  Found nodes directory: ${nodesDirPath}`);
          
          try {
            const nodeFiles = fs.readdirSync(nodesDirPath);
            let nodesUpdatedInThisRoot = 0;
            
            for (const nodeFile of nodeFiles) {
              if (nodeFile.endsWith('.json')) {
                const nodePath = path.join(nodesDirPath, nodeFile);
                
                try {
                  const nodeData = JSON.parse(fs.readFileSync(nodePath, 'utf8'));
                  
                  // Check if this is an assistant node with model source_info that needs migration
                  if (nodeData.message && 
                      nodeData.message.role === 'assistant' &&
                      nodeData.metadata && 
                      nodeData.metadata.source_info && 
                      nodeData.metadata.source_info.type === 'model' &&
                      !nodeData.metadata.source_info.provider) {
                    
                    // Update source_info with explicit provider and model_name
                    nodeData.metadata.source_info.provider = originalProvider;
                    
                    // Prefer parameters.model, fallback to root's model
                    if (nodeData.metadata.source_info.parameters && 
                        nodeData.metadata.source_info.parameters.model) {
                      nodeData.metadata.source_info.model_name = nodeData.metadata.source_info.parameters.model;
                    } else if (originalModelForRoot) {
                      console.warn(`    Node ${nodeData.id} in root ${rootInfo.id} is missing parameters.model in source_info. Using root model as fallback.`);
                      nodeData.metadata.source_info.model_name = originalModelForRoot;
                    } else {
                      console.warn(`    Node ${nodeData.id} in root ${rootInfo.id} is missing both parameters.model and root model. Skipping model_name update.`);
                      continue;
                    }
                    
                    // Backup individual node file
                    const nodeBackupPath = nodePath + '.backup-migration-node-' + Date.now();
                    fs.copyFileSync(nodePath, nodeBackupPath);
                    totalNodesBackedUp++;
                    
                    // Write updated node file
                    fs.writeFileSync(nodePath, JSON.stringify(nodeData, null, 2));
                    nodesUpdatedInThisRoot++;
                    totalNodesUpdated++;
                    
                    console.log(`    Updated source_info for node ${nodeData.id}`);
                  }
                } catch (nodeError) {
                  console.error(`    Error processing node file ${nodeFile}:`, nodeError.message);
                }
              }
            }
            
            if (nodesUpdatedInThisRoot > 0) {
              console.log(`  Updated ${nodesUpdatedInThisRoot} nodes in root ${rootInfo.id}`);
            } else {
              console.log(`  No nodes needed migration in root ${rootInfo.id}`);
            }
          } catch (dirError) {
            console.error(`  Error reading nodes directory ${nodesDirPath}:`, dirError.message);
          }
        } else {
          console.log(`  No nodes directory found for root ${rootInfo.id}`);
        }
      }
      
      // Now update the root configuration (remove provider and model)
      if (rootInfo.config && (rootInfo.config.provider || rootInfo.config.model)) {
        console.log(`  Migrating root ${rootInfo.id} config: removing provider/model from config`);
        
        // Keep only systemPrompt in config
        const newConfig = {};
        if (rootInfo.config.systemPrompt !== undefined) {
          newConfig.systemPrompt = rootInfo.config.systemPrompt;
        }
        
        rootInfo.config = newConfig;
        rootsFileNeedsUpdate = true;
      }
    }

    // Summary logging
    if (totalNodesUpdated > 0) {
      console.log(`\nNode migration summary:`);
      console.log(`  Total nodes updated: ${totalNodesUpdated}`);
      console.log(`  Total node backups created: ${totalNodesBackedUp}`);
    }

    // Backup and save roots.json if needed
    if (rootsFileNeedsUpdate) {
      // Backup original file
      const backupPath = rootsPath + '.backup-migration-mainconfig-' + Date.now();
      fs.copyFileSync(rootsPath, backupPath);
      console.log(`\nRoots config backup created: ${backupPath}`);
      
      // Write updated file
      fs.writeFileSync(rootsPath, JSON.stringify(rootsData, null, 2));
      console.log('roots.json migration completed');
    } else {
      console.log('\nroots.json config already in new format, no migration needed');
    }
  } catch (error) {
    console.error('Failed to migrate roots.json:', error);
  }
}

function migrateConfigToml(dataDir) {
  const configPath = path.join(dataDir, 'config.toml');
  
  if (!fs.existsSync(configPath)) {
    console.log('No config.toml found, creating with default model');
    const defaultConfig = `[defaults]
model = "openai/gpt-4o"
temperature = 1
maxTokens = 1024
n = 5
systemPrompt = "You are a helpful assistant."

[providers.anthropic]
apiKey = "your API key"

[providers.openai]
apiKey = "your API key"

[providers.google]
apiKey = "your API key"
projectId = "your project id"
`;
    fs.writeFileSync(configPath, defaultConfig);
    console.log('Created config.toml with default model');
    return;
  }

  console.log(`Checking ${configPath} for default model...`);
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Simple check if model is already in defaults section
    if (configContent.includes('[defaults]') && configContent.includes('model = ')) {
      console.log('config.toml already has default model, no migration needed');
      return;
    }

    // Add default model to config
    let updatedConfig = configContent;
    
    // Find [defaults] section or create it
    if (configContent.includes('[defaults]')) {
      // Add model to existing defaults section
      updatedConfig = configContent.replace(
        /\[defaults\]/,
        '[defaults]\nmodel = "openai/gpt-4o"'
      );
    } else {
      // Add defaults section at the beginning
      updatedConfig = `[defaults]
model = "openai/gpt-4o"
temperature = 1
maxTokens = 1024
n = 5
systemPrompt = "You are a helpful assistant."

` + configContent;
    }

    // Backup original file
    const backupPath = configPath + '.backup-' + Date.now();
    fs.copyFileSync(configPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
    
    // Write updated file
    fs.writeFileSync(configPath, updatedConfig);
    console.log('config.toml migration completed');
  } catch (error) {
    console.error('Failed to migrate config.toml:', error);
  }
}

function main() {
  const dataDir = resolveDataDir(process.env.DATA_DIR || '~/.loom');
  
  console.log(`Migrating loom data in: ${dataDir}`);
  
  if (!fs.existsSync(dataDir)) {
    console.log('Data directory does not exist, no migration needed');
    return;
  }

  migrateRootsJson(dataDir);
  migrateConfigToml(dataDir);
  
  console.log('Migration completed!');
}

// Run migration if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { main };