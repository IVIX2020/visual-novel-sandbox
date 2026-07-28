import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const DATA_DIR = './_sandbox/data';
const OUTPUT_FILE = './_sandbox/PROJECT_MAP.md';

async function generateMap() {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.md') && f !== 'master.md');
    
    let markdown = '# The House: Project Map\n\n';
    markdown += 'このファイルは自動生成されました。シーン間の繋がりと構造を示します。\n\n';
    
    const connections = [];

    files.forEach(file => {
        const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
        const sceneId = file.replace('.md', '');
        
        // Frontmatterからタイトル取得
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        let title = sceneId;
        if (fmMatch) {
            const fm = yaml.load(fmMatch[1]);
            title = fm.title || sceneId;
        }

        markdown += `## ${title} (\`${sceneId}\`)\n`;
        
        // リンク（移動）の抽出
        const moveMatches = content.matchAll(/\[\[(.*?)\|(.*?)\]\]/g);
        const links = [];
        for (const match of moveMatches) {
            links.push({ target: match[1], label: match[2] });
            connections.push(`- \`${sceneId}\` (${title}) ──[[ ${match[2]} ]]──> \`${match[1]}\``);
        }

        if (links.length > 0) {
            markdown += '### 移動先\n';
            links.forEach(l => markdown += `- [[${l.target}|${l.label}]]\n`);
        }

        // 調査要素の抽出
        const eventMatches = content.matchAll(/\((memory|item):(.*?)\|(.*?)\)/g);
        const events = [];
        for (const match of eventMatches) {
            events.push({ type: match[1], id: match[2], label: match[3] });
        }

        if (events.length > 0) {
            markdown += '### 調査要素\n';
            events.forEach(e => markdown += `- ${e.label} (\`${e.type}:${e.id}\`)\n`);
        }
        
        markdown += '\n---\n';
    });

    markdown += '\n## 接続図 (簡易リスト)\n';
    markdown += connections.join('\n') + '\n';

    fs.writeFileSync(OUTPUT_FILE, markdown);
    console.log(`Map generated: ${OUTPUT_FILE}`);
}

generateMap();
