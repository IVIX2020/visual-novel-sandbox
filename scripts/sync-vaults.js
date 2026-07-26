import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const vaultsDir = path.join(rootDir, 'vaults');
const manifestFile = path.join(vaultsDir, 'manifest.json');

function formatTitle(id) {
    if (id === 'the_house') return '🏠 The House [祖父の記憶と家]';
    if (id === 'cyber_tokyo') return '🌆 Cyber Tokyo 2099 [電脳街の路地裏]';
    if (id === 'the_morning_cafe') return '☕ The Morning Cafe [朝のカフェ]';
    if (id === 'the_seaside_cafe') return '☕ The Seaside Cafe [海辺のカフェ]';
    if (id === '桃太郎') return '📖 桃太郎';
    if (id === 'test') return '🧪 実験用 Vault';
    
    const formattedName = id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `📖 ${formattedName}`;
}

function normalizeTarget(rawPath) {
    if (!rawPath) return '';
    let filename = rawPath.split('/').pop();
    filename = filename.replace(/\.md$/i, '');
    return filename.trim();
}

/**
 * Obsidian Canvas (.canvas) ファイルを全自動生成するロジック
 */
function generateObsidianCanvas(vaultName, vaultPath, mdFiles) {
    // 実験用 vaults/test のキャンバスは手動テスト用にプログラム自動上書きを保護！
    if (vaultName === 'test') {
        return;
    }

    const rawNodesMap = new Map();
    const rawEdges = [];

    mdFiles.forEach((file) => {
        const fileId = normalizeTarget(file);
        if (fileId.toLowerCase() === 'master' || fileId.toLowerCase() === 'readme') return;

        const filePath = path.join(vaultPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        const isStart = !!(content.match(/start:\s*true/i) || content.match(/initial:\s*true/i));
        const titleMatch = content.match(/title:\s*(.*)/);
        const title = titleMatch ? titleMatch[1].trim() : fileId;
        const cleanContent = content.replace(/^---[\s\S]*?---\n?/, '').trim();
        const mainExcerpt = cleanContent.split(/^#+\s+/gm)[0].replace(/\[\[.*?\]\]/g, '').trim().slice(0, 70);

        rawNodesMap.set(fileId, {
            id: fileId,
            type: "file",
            title,
            file,
            excerpt: mainExcerpt,
            isStart,
            level: 0,
            targets: []
        });

        const sectionBlocks = cleanContent.split(/^#+\s+/gm).slice(1);
        sectionBlocks.forEach((block) => {
            const lines = block.split('\n');
            const secTitle = lines[0].trim().replace(/\(.*\)/, '').replace(/^#+\s*/, '').trim();
            if (!secTitle) return;

            const secId = `${fileId}#${secTitle}`;
            const secExcerpt = lines.slice(1).join(' ').replace(/\[\[.*?\]\]/g, '').trim().slice(0, 50);

            rawNodesMap.set(secId, {
                id: secId,
                type: "section",
                title: secTitle,
                file,
                excerpt: secExcerpt,
                isStart: false,
                level: 0,
                targets: []
            });
        });
    });

    let edgeCounter = 1;

    mdFiles.forEach(file => {
        const sourceFileId = normalizeTarget(file);
        if (!rawNodesMap.has(sourceFileId)) return;

        const filePath = path.join(vaultPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const cleanContent = content.replace(/^---[\s\S]*?---\n?/, '').trim();

        const parts = cleanContent.split(/^#+\s+/gm);
        parseLinks(parts[0], sourceFileId);

        parts.slice(1).forEach(block => {
            const lines = block.split('\n');
            const secTitle = lines[0].trim().replace(/\(.*\)/, '').replace(/^#+\s*/, '').trim();
            const secId = `${sourceFileId}#${secTitle}`;
            if (rawNodesMap.has(secId)) {
                parseLinks(lines.slice(1).join('\n'), secId);
            }
        });

        function parseLinks(textBlock, fromId) {
            const wikiRegex = /(?:^|[^\!])\[\[([^|]+?)(?:\|([^\]]+?))?\]\]/g;
            let match;
            while ((match = wikiRegex.exec(textBlock)) !== null) {
                const rawTarget = match[1].trim();
                const label = match[2] ? match[2].trim() : rawTarget;
                let targetId = '';

                if (rawTarget.startsWith('#')) {
                    targetId = `${sourceFileId}#${rawTarget.replace(/^#+\s*/, '').trim()}`;
                } else {
                    targetId = normalizeTarget(rawTarget);
                }

                if (rawNodesMap.has(targetId) && targetId !== fromId) {
                    rawEdges.push({
                        id: `edge-${edgeCounter++}`,
                        fromNode: fromId,
                        fromSide: "right",
                        toNode: targetId,
                        toSide: "left",
                        label: label
                    });
                    const node = rawNodesMap.get(fromId);
                    if (node) node.targets.push(targetId);
                }
            }
        }
    });

    const startNode = Array.from(rawNodesMap.values()).find(n => n.isStart) || Array.from(rawNodesMap.values())[0];
    if (startNode) {
        startNode.level = 0;
        const queue = [startNode.id];
        const visited = new Set([startNode.id]);

        while (queue.length > 0) {
            const currId = queue.shift();
            const currNode = rawNodesMap.get(currId);
            if (!currNode) continue;

            currNode.targets.forEach(targetId => {
                const targetNode = rawNodesMap.get(targetId);
                if (targetNode) {
                    targetNode.level = Math.max(targetNode.level, currNode.level + 1);
                    if (!visited.has(targetId)) {
                        visited.add(targetId);
                        queue.push(targetId);
                    }
                }
            });
        }
    }

    const levelsMap = new Map();
    rawNodesMap.forEach(node => {
        const lvl = node.level || 0;
        if (!levelsMap.has(lvl)) levelsMap.set(lvl, []);
        levelsMap.get(lvl).push(node);
    });

    const nodes = [];
    const mainWidth = 340;
    const mainHeight = 220;
    const subWidth = 280;
    const subHeight = 160;
    const levelGap = 220;
    const rowGap = 60;

    const sortedLevels = Array.from(levelsMap.keys()).sort((a, b) => a - b);
    let currentX = 0;

    sortedLevels.forEach(lvl => {
        const nodesInLevel = levelsMap.get(lvl);
        let currentY = 0;

        nodesInLevel.forEach(node => {
            const width = node.type === 'file' ? mainWidth : subWidth;
            const height = node.type === 'file' ? mainHeight : subHeight;

            node.x = currentX;
            node.y = currentY;

            if (node.type === 'file') {
                nodes.push({
                    id: node.id,
                    type: "text",
                    text: `### 📄 [[${node.file}|${node.title}]]\n\`${node.file}\`\n\n${node.excerpt}${node.excerpt.length >= 70 ? '...' : ''}`,
                    x: node.x,
                    y: node.y,
                    width: width,
                    height: height,
                    color: "1"
                });
            } else {
                nodes.push({
                    id: node.id,
                    type: "text",
                    text: `#### 🔖 ## ${node.title}\n\n${node.excerpt}${node.excerpt.length >= 50 ? '...' : ''}`,
                    x: node.x,
                    y: node.y,
                    width: width,
                    height: height,
                    color: "4"
                });
            }

            currentY += height + rowGap;
        });

        currentX += mainWidth + levelGap;
    });

    const canvasData = { nodes, edges: rawEdges };
    const canvasPath = path.join(vaultPath, 'story_map.canvas');
    fs.writeFileSync(canvasPath, JSON.stringify(canvasData, null, 2), 'utf-8');
}

export function syncVaults() {
    if (!fs.existsSync(vaultsDir)) {
        console.warn(`Vaults dir missing: ${vaultsDir}`);
        return;
    }

    const items = fs.readdirSync(vaultsDir, { withFileTypes: true });
    const vaultFolders = items
        .filter(item => item.isDirectory() && !item.name.startsWith('.'))
        .map(item => item.name);

    const manifest = [];

    vaultFolders.forEach(vaultName => {
        const vaultPath = path.join(vaultsDir, vaultName);
        const mdFiles = fs.readdirSync(vaultPath)
            .filter(f => f.endsWith('.md'))
            .sort();

        fs.writeFileSync(
            path.join(vaultPath, 'files.json'),
            JSON.stringify(mdFiles, null, 2),
            'utf-8'
        );

        generateObsidianCanvas(vaultName, vaultPath, mdFiles);

        manifest.push({
            id: vaultName,
            name: formatTitle(vaultName)
        });
    });

    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8');
}

syncVaults();
