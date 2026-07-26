import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const vaultsDir = path.join(rootDir, 'vaults');

function normalizeTarget(rawPath) {
    if (!rawPath) return '';
    let filename = rawPath.split('/').pop();
    filename = filename.replace(/\.md$/i, '');
    return filename.trim();
}

/**
 * Obsidian Canvas (.canvas) から Markdown ファイル構造＆選択肢リンクを全自動逆生成するエンジン
 * 
 * 選択肢リンク [[...]] を、各カードのテキストの直下 (次の見出しの手前) に100%正確にスマート挿入！
 */
export function syncCanvasToMd() {
    if (!fs.existsSync(vaultsDir)) return;

    const items = fs.readdirSync(vaultsDir, { withFileTypes: true });
    const vaultFolders = items
        .filter(item => item.isDirectory() && !item.name.startsWith('.'))
        .map(item => item.name);

    vaultFolders.forEach(vaultName => {
        const vaultPath = path.join(vaultsDir, vaultName);
        const canvasPath = path.join(vaultPath, 'story_map.canvas');

        if (!fs.existsSync(canvasPath)) return;

        try {
            const canvasStat = fs.statSync(canvasPath);
            const syncFlagFile = path.join(vaultPath, '.canvas_last_sync');
            
            let lastSyncTime = 0;
            if (fs.existsSync(syncFlagFile)) {
                lastSyncTime = parseInt(fs.readFileSync(syncFlagFile, 'utf-8') || '0', 10);
            }

            if (canvasStat.mtimeMs <= lastSyncTime + 1000) {
                return;
            }

            console.log(`[Canvas -> MD] Smart Choice Insertion & Hierarchy Sync in ${canvasPath}...`);
            const canvasData = JSON.parse(fs.readFileSync(canvasPath, 'utf-8'));
            const { nodes = [], edges = [] } = canvasData;

            const nodeIdToFileMap = new Map();

            // 1. ノードの役割判定 (#, ##, ### から分類)
            nodes.forEach(node => {
                let nodeText = (node.text || '').trim();
                if (!nodeText && node.type !== 'file') return;

                let fileName = '';
                let fileTitle = '';
                let nodeType = 'file';

                const firstLine = nodeText.split('\n')[0].trim();

                if (firstLine.startsWith('###')) {
                    nodeType = 'h3';
                    fileTitle = firstLine.replace(/^###\s*/, '').trim();
                } else if (firstLine.startsWith('##')) {
                    nodeType = 'h2';
                    fileTitle = firstLine.replace(/^##\s*/, '').trim();
                } else if (node.type === 'file' && node.file) {
                    fileName = normalizeTarget(node.file) + '.md';
                    fileTitle = normalizeTarget(node.file);
                } else {
                    let cleanLine = firstLine.replace(/^#\s*/, '').replace(/^[📄🔖]\s*/, '').trim();
                    const wikiMatch = cleanLine.match(/\[\[(.*?)(?:\|(.*?))?\]\]/);
                    if (wikiMatch) {
                        cleanLine = wikiMatch[1].trim();
                    }

                    if (cleanLine && !cleanLine.match(/^[0-9a-f-]{8,}$/i) && !cleanLine.match(/^node-\d+$/i)) {
                        fileName = normalizeTarget(cleanLine) + '.md';
                        fileTitle = cleanLine.replace(/\.md$/i, '');
                    }
                }

                nodeIdToFileMap.set(node.id, {
                    fileName,
                    filePath: fileName ? path.join(vaultPath, fileName) : '',
                    fileTitle,
                    nodeType,
                    nodeText,
                    node
                });
            });

            // 2. 矢印 (edges) の接続関係から親ファイル名 (ownerFile) を自動解決
            const parentFileMap = new Map();
            nodeIdToFileMap.forEach((info, nodeId) => {
                if (info.nodeType === 'file') {
                    parentFileMap.set(nodeId, nodeId);
                }
            });

            let changed = true;
            let passCount = 0;
            while (changed && passCount < 10) {
                changed = false;
                passCount++;
                edges.forEach(edge => {
                    const fromFileId = parentFileMap.get(edge.fromNode);
                    if (fromFileId && !parentFileMap.has(edge.toNode)) {
                        parentFileMap.set(edge.toNode, fromFileId);
                        changed = true;
                    }
                });
            }

            // 3. メインファイル (# ノート名.md) の初期生成
            nodeIdToFileMap.forEach((info) => {
                if (info.nodeType === 'file' && info.fileName) {
                    if (!fs.existsSync(info.filePath)) {
                        const cleanBody = (info.nodeText || '').replace(/^#\s+.*$/m, '').trim();
                        const newContent = `---\ntitle: ${info.fileTitle}\n---\n${cleanBody}\n`;
                        fs.writeFileSync(info.filePath, newContent, 'utf-8');
                        console.log(`[Canvas -> MD] Generated note: ${info.filePath}`);
                    }
                }
            });

            // 4. セクションノード (## H2 / ### H3) を所有親ノートへ合体統合
            nodeIdToFileMap.forEach((info, nodeId) => {
                if (info.nodeType !== 'file') {
                    const ownerNodeId = parentFileMap.get(nodeId);
                    if (ownerNodeId) {
                        const ownerObj = nodeIdToFileMap.get(ownerNodeId);
                        if (ownerObj && ownerObj.filePath && fs.existsSync(ownerObj.filePath)) {
                            let content = fs.readFileSync(ownerObj.filePath, 'utf-8');
                            const headerPrefix = info.nodeType === 'h3' ? '###' : '##';
                            const secHeader = `${headerPrefix} ${info.fileTitle}`;

                            if (!content.includes(secHeader)) {
                                let cleanSecText = info.nodeText.trim();
                                const firstLine = cleanSecText.split('\n')[0];
                                const restBody = cleanSecText.split('\n').slice(1).join('\n').trim();
                                cleanSecText = `${firstLine}\n\n${restBody}`;

                                content = content.trim() + `\n\n${cleanSecText}\n`;
                                fs.writeFileSync(ownerObj.filePath, content, 'utf-8');
                                console.log(`[Canvas -> MD] Merged ${info.nodeType.toUpperCase()} "${secHeader}" into root note ${ownerObj.fileName}`);
                            }
                        }
                    }
                }
            });

            // 5. 【各ノード直下へ選択肢リンク [[...]] をスマート精度挿入！】
            edges.forEach(edge => {
                const { fromNode, toNode, label = '' } = edge;
                if (!fromNode || !toNode) return;

                const fromObj = nodeIdToFileMap.get(fromNode);
                const toObj = nodeIdToFileMap.get(toNode);
                const ownerNodeId = parentFileMap.get(fromNode);
                const ownerObj = ownerNodeId ? nodeIdToFileMap.get(ownerNodeId) : null;

                if (ownerObj && ownerObj.filePath && fs.existsSync(ownerObj.filePath)) {
                    let content = fs.readFileSync(ownerObj.filePath, 'utf-8');
                    let targetLink = '';

                    if (toObj.nodeType === 'file') {
                        const targetName = normalizeTarget(toObj.fileName);
                        targetLink = label ? `[[${targetName}|${label}]]` : `[[${targetName}]]`;
                    } else {
                        targetLink = label ? `[[# ${toObj.fileTitle}|${label}]]` : `[[# ${toObj.fileTitle}]]`;
                    }

                    if (!content.includes(targetLink)) {
                        if (fromObj.nodeType === 'file') {
                            // メイン本文 (最初の ## 見出しの手前) に正確挿入！
                            const firstH2Match = content.match(/\n(?=##+ )/);
                            if (firstH2Match) {
                                const idx = firstH2Match.index;
                                content = content.slice(0, idx).trim() + `\n\n${targetLink}\n\n` + content.slice(idx).trim();
                            } else {
                                content = content.trim() + `\n\n${targetLink}\n`;
                            }
                        } else {
                            // H2/H3 セクション直下 (次の ## 見出しの手前) に正確挿入！
                            const secHeader = `${fromObj.nodeType === 'h3' ? '###' : '##'} ${fromObj.fileTitle}`;
                            const secIdx = content.indexOf(secHeader);
                            if (secIdx !== -1) {
                                const afterHeader = content.slice(secIdx + secHeader.length);
                                const nextSecMatch = afterHeader.match(/\n(?=##+ )/);
                                if (nextSecMatch) {
                                    const nextIdx = secIdx + secHeader.length + nextSecMatch.index;
                                    content = content.slice(0, nextIdx).trim() + `\n\n${targetLink}\n\n` + content.slice(nextIdx).trim();
                                } else {
                                    content = content.trim() + `\n\n${targetLink}\n`;
                                }
                            } else {
                                content = content.trim() + `\n\n${targetLink}\n`;
                            }
                        }

                        fs.writeFileSync(ownerObj.filePath, content, 'utf-8');
                        console.log(`[Canvas -> MD] Choice ${targetLink} smartly placed in ${fromObj.fileTitle || fromObj.fileName}`);
                    }
                }
            });

            // 6. 親なしノード＆子数最多ノードの解析 ➔ master.md と start: true の全自動生成
            const fileNodes = Array.from(nodeIdToFileMap.values()).filter(n => n.nodeType === 'file' && n.fileName);

            if (fileNodes.length > 0) {
                const inDegreeMap = new Map();
                const outDegreeMap = new Map();

                fileNodes.forEach(fn => {
                    inDegreeMap.set(fn.fileName, 0);
                    outDegreeMap.set(fn.fileName, 0);
                });

                edges.forEach(edge => {
                    const fromFileId = parentFileMap.get(edge.fromNode);
                    const toFileId = parentFileMap.get(edge.toNode);

                    if (fromFileId && toFileId && fromFileId !== toFileId) {
                        const fromObj = nodeIdToFileMap.get(fromFileId);
                        const toObj = nodeIdToFileMap.get(toFileId);

                        if (fromObj && toObj && fromObj.fileName && toObj.fileName) {
                            outDegreeMap.set(fromObj.fileName, (outDegreeMap.get(fromObj.fileName) || 0) + 1);
                            inDegreeMap.set(toObj.fileName, (inDegreeMap.get(toObj.fileName) || 0) + 1);
                        }
                    }
                });

                const candidates = fileNodes.filter(fn => (inDegreeMap.get(fn.fileName) || 0) === 0);
                let startFileObj = null;

                if (candidates.length > 0) {
                    candidates.sort((a, b) => (outDegreeMap.get(b.fileName) || 0) - (outDegreeMap.get(a.fileName) || 0));
                    startFileObj = candidates[0];
                } else {
                    fileNodes.sort((a, b) => (a.node.x || 0) - (b.node.x || 0));
                    startFileObj = fileNodes[0];
                }

                if (startFileObj) {
                    const startTitle = startFileObj.fileTitle;

                    const masterPath = path.join(vaultPath, 'master.md');
                    const masterContent = `---\nstart: ${startTitle}\n---\n# Master Config\nstart_scene: ${startTitle}\n`;
                    fs.writeFileSync(masterPath, masterContent, 'utf-8');
                    console.log(`[Canvas -> MD] Auto-generated master.md setting start scene to: ${startTitle}`);

                    if (fs.existsSync(startFileObj.filePath)) {
                        let sContent = fs.readFileSync(startFileObj.filePath, 'utf-8');
                        if (!sContent.includes('start: true')) {
                            sContent = sContent.replace(/^---\ntitle: (.*)\n---/, `---\ntitle: $1\nstart: true\n---`);
                            fs.writeFileSync(startFileObj.filePath, sContent, 'utf-8');
                            console.log(`[Canvas -> MD] Marked ${startFileObj.fileName} as start: true`);
                        }
                    }
                }
            }

            fs.writeFileSync(syncFlagFile, Date.now().toString(), 'utf-8');

        } catch (e) {
            console.error("Canvas -> MD sync failed:", e);
        }
    });
}

syncCanvasToMd();
