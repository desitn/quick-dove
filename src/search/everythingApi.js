/**
 * Everything HTTP API 封装模块
 * 负责与 Everything HTTP 服务器通信
 */

const http = require('http');
const path = require('path');
const { debugLog } = require('../debug');

class EverythingApi {
    constructor() {
        this.defaultPort = 8080;
        this.timeout = 5000;
    }

    /**
     * 搜索文件
     * @param {string} keyword 搜索关键词
     * @param {Object} options 搜索选项
     * @param {number} options.port HTTP服务器端口
     * @param {string} options.scope 搜索范围 ('workspace' | 'global')
     * @param {string} options.workspacePath 工作区路径
     * @param {number} options.maxResults 最大结果数
     * @param {string} options.type 文件类型过滤 ('files' | 'folders' | 'all')
     * @returns {Promise<Array>} 搜索结果数组
     */
    async search(keyword, options = {}) {
        const port = options.port || this.defaultPort;
        const scope = options.scope || 'global';
        const workspacePath = options.workspacePath || '';
        const maxResults = options.maxResults || 50;
        const type = options.type || 'all';

        return new Promise((resolve, reject) => {
            // Build search query
            let searchQuery = keyword;
            if (scope === 'workspace' && workspacePath) {
                searchQuery = `${workspacePath} ${keyword}`;
            }

            // Build URL parameters
            const params = new URLSearchParams();
            params.append('search', searchQuery);
            params.append('json', '1');
            params.append('count', maxResults.toString());
            params.append('path_column', '1'); 

            // Add type filter
            if (type === 'files') {
                params.append('filter', 'file');
            } else if (type === 'folders') {
                params.append('filter', 'folder');
            }

            const url = `http://localhost:${port}/?${params.toString()}`;
            debugLog('EverythingApi', `Searching: ${url}`);

            const request = http.get(url, { timeout: this.timeout }, (response) => {
                let data = '';

                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.error) {
                            reject(new Error(result.error));
                            return;
                        }

                        // Format results
                        const formattedResults = this._formatResults(result.results || []);
                        debugLog('EverythingApi', `Found ${formattedResults.length} results`);
                        resolve(formattedResults);
                    } catch (error) {
                        reject(new Error(`Parse error: ${error.message}`));
                    }
                });
            });

            request.on('error', (error) => {
                debugLog('EverythingApi', `Request error: ${error.message}`);
                reject(new Error(`Connection failed: ${error.message}`));
            });

            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    /**
     * 测试 Everything HTTP 服务器连接
     * @param {number} port HTTP服务器端口
     * @returns {Promise<boolean>}
     */
    async testConnection(port = this.defaultPort) {
        try {
            await this.search('test', { port, maxResults: 1 });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 格式化搜索结果
     * @param {Array} results 原始结果数组
     * @returns {Array} 格式化后的结果
     */
    _formatResults(results) {
        debugLog('EverythingApi', '_formatResults called with', results.length, 'items');
        
        return results.map((item, index) => {
            // Everything API 返回：
            // - name: 命中的检索结果（文件名或文件夹名）
            // - path: 该结果的所属路径（父目录）
            // 需要组合成完整路径
            const fileName = item.name || '';
            let fullPath = item.path || '';
            
            // 组合路径和文件名
            if (fileName && fullPath && !fullPath.endsWith(fileName)) {
                const separator = fullPath.includes('/') ? '/' : '\\';
                if (!fullPath.endsWith(separator)) {
                    fullPath += separator;
                }
                fullPath += fileName;
            }
            
            const formattedItem = {
                name: fileName,  // 文件名
                path: fullPath,  // 完整路径
                filePath: fullPath, // 别名：完整路径
                fileName: fileName, // 别名：文件名
                type: item.type || 'file',
                size: item.size,
                dateModified: item.date_modified,
                isDirectory: item.type === 'folder' || (item.attributes & 0x10) !== 0
            };
            
            // 只记录第一个和最后一个项目的详细信息，避免日志过多
            if (index === 0 || index === results.length - 1) {
                debugLog('EverythingApi', `Item[${index}] raw:`, JSON.stringify(item));
                debugLog('EverythingApi', `Item[${index}] formatted:`, JSON.stringify(formattedItem));
            }
            
            return formattedItem;
        });
    }
}

module.exports = EverythingApi;
