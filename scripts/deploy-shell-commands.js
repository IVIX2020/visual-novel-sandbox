import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const vaultsDir = path.join(rootDir, 'vaults');

const shellCommandsConfig = {
  "settings_version": "0.23.0",
  "shell_commands": [
    {
      "id": "sc-sync-canvas-map",
      "alias": "✨ キャンバスマップ整列 (MD -> Canvas)",
      "platform_specific_commands": {
        "default": "PATH=$PATH:/usr/local/bin:/opt/homebrew/bin npm run sync-vaults"
      },
      "icon": "map",
      "working_directory": {
        "path": rootDir,
        "type": "absolute"
      },
      "events": [],
      "preactions": [],
      "postactions": [
        {
          "id": "postaction-1",
          "action": "obsidian_notification",
          "message": "🗺️ キャンバスマップをきれいに最新整列しました！"
        }
      ]
    },
    {
      "id": "sc-sync-canvas-to-md",
      "alias": "🔄 キャンバスからMD構築 (Canvas -> MD)",
      "platform_specific_commands": {
        "default": "PATH=$PATH:/usr/local/bin:/opt/homebrew/bin npm run sync-canvas"
      },
      "icon": "file-plus",
      "working_directory": {
        "path": rootDir,
        "type": "absolute"
      },
      "events": [],
      "preactions": [],
      "postactions": [
        {
          "id": "postaction-2",
          "action": "obsidian_notification",
          "message": "📄 キャンバスのカードからMDファイルと選択肢を同期構築しました！"
        }
      ]
    }
  ]
};

// 1. ルートの .obsidian に配備
const rootPluginDir = path.join(rootDir, '.obsidian', 'plugins', 'obsidian-shellcommands');
fs.mkdirSync(rootPluginDir, { recursive: true });
fs.writeFileSync(path.join(rootPluginDir, 'data.json'), JSON.stringify(shellCommandsConfig, null, 2), 'utf-8');

// 2. 各 Vault (桃太郎等) の .obsidian にも全自動配備！
if (fs.existsSync(vaultsDir)) {
    const items = fs.readdirSync(vaultsDir, { withFileTypes: true });
    items.filter(item => item.isDirectory() && !item.name.startsWith('.')).forEach(item => {
        const vaultPluginDir = path.join(vaultsDir, item.name, '.obsidian', 'plugins', 'obsidian-shellcommands');
        fs.mkdirSync(vaultPluginDir, { recursive: true });
        fs.writeFileSync(path.join(vaultPluginDir, 'data.json'), JSON.stringify(shellCommandsConfig, null, 2), 'utf-8');
        console.log(`Deployed Shell Commands settings to: ${vaultPluginDir}`);
    });
}
