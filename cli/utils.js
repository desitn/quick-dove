const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const iconv = require('iconv-lite');
const admzip = require('adm-zip');

/** 工具配置缓存 */
let toolsConfigCache = null;

/**
 * 加载工具配置文件
 */
function loadToolsConfig() {
    if (toolsConfigCache) {
        return toolsConfigCache;
    }
    
    const toolsDir = getToolsPath();
    const configPath = path.join(toolsDir, 'tools-config.json');
    
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            toolsConfigCache = config;
            return config;
        } catch (error) {
            console.error('工具配置文件解析失败:', error.message);
        }
    }
    
    // 返回默认配置
    return {
        tools: {},
        platforms: {},
        settings: {
            defaultPort: 'auto',
            timeout: 300,
            retryCount: 3
        }
    };
}

/**
 * 获取工具配置
 */
function getToolConfig(toolType) {
    const config = loadToolsConfig();
    return config.tools[toolType] || null;
}

/**
 * 获取平台配置
 */
function getPlatformConfig(platformType) {
    const config = loadToolsConfig();
    return config.platforms[platformType] || null;
}

/**
 * 获取工具完整路径
 */
function getToolPath(toolType) {
    const toolConfig = getToolConfig(toolType);
    if (!toolConfig) {
        throw new Error(`未知工具类型: ${toolType}`);
    }
    
    const toolsDir = getToolsPath();
    return path.join(toolsDir, toolConfig.path);
}

/**
 * 构建工具参数
 */
function buildToolArgs(toolType, action, params = {}) {
    const toolConfig = getToolConfig(toolType);
    if (!toolConfig || !toolConfig.args) {
        return [];
    }
    
    const argsTemplate = toolConfig.args[action] || toolConfig.args.default || [];
    
    // 替换参数占位符
    return argsTemplate.map(arg => {
        let result = arg;
        for (const [key, value] of Object.entries(params)) {
            result = result.replace(`{${key}}`, value);
        }
        return result;
    });
}

/**
 * 查找工作空间路径
 */
function findWorkspacePath() {
    const currentDir = process.cwd();
    
    // 检查当前目录是否是工作空间
    if (fs.existsSync(path.join(currentDir, 'quectel_build'))) {
        return currentDir;
    }
    
    // 向上查找
    let dir = currentDir;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'quectel_build'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    
    return null;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 创建固件信息对象
 */
function createFirmwareInfo(filePath) {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    
    // 确定类型
    let type = 'UNKNOWN';
    const lower = fileName.toLowerCase();
    if (lower.endsWith('_fbf.bin')) {
        type = 'ASR FBF';
    } else if (lower.endsWith('.pac')) {
        type = 'UNISOC PAC';
    } else if (lower.endsWith('.zip')) {
        type = 'ASR ABOOT';
    } else if (lower.endsWith('download_usb.ini')) {
        type = 'Eigen ECF';
    }
    
    return {
        name: fileName,
        path: filePath,
        type: type,
        size: stats.size,
        time: stats.mtime.toLocaleString('zh-CN'),
        mtime: stats.mtime
    };
}

/**
 * 获取所有支持的平台类型
 */
function getSupportedPlatforms() {
    const config = loadToolsConfig();
    return Object.keys(config.platforms || {});
}

/**
 * 根据固件文件确定平台类型
 */
function determinePlatformByFirmware(filename) {
    const config = loadToolsConfig();
    const platforms = config.platforms || {};
    
    for (const [platformKey, platformConfig] of Object.entries(platforms)) {
        // 检查扩展名
        if (platformConfig.extensions) {
            for (const ext of platformConfig.extensions) {
                if (filename.toLowerCase().endsWith(ext.toLowerCase())) {
                    return platformKey;
                }
            }
        }
        
        // 特殊检测：ASR 160X ZIP 文件
        if (platformKey === 'asr160x' && filename.toLowerCase().endsWith('.zip')) {
            // 需要通过 zipIsAdownloadFile 进一步确认
            return 'asr160x_candidate';
        }
    }
    
    return null;
}

/**
 * 获取全局设置
 */
function getGlobalSettings() {
    const config = loadToolsConfig();
    return config.settings || {};
}

/**
 * 获取CLI所在目录的父目录（应该是quick-firmware根目录）
 */
function getProjectRoot() {
    const cliDir = __dirname;
    return path.dirname(cliDir);
}

/**
 * 获取tools目录路径
 */
function getToolsPath() {
    // 如果是打包的exe文件，使用exe路径计算tools目录
    if (process.execPath && process.execPath.endsWith('.exe')) {
        // exe 现在和 tools 平级
        // exe: quick-firmware/firmware-cli.exe
        // tools: quick-firmware/tools/
        const projectRoot = path.dirname(process.execPath);
        const toolsDir = path.join(projectRoot, 'tools');
        
        // 验证tools目录是否存在
        if (fs.existsSync(toolsDir)) {
            return toolsDir;
        }
    }
    
    // 开发环境：使用__dirname计算
    const projectRoot = getProjectRoot();
    return path.join(projectRoot, 'tools');
}

/**
 * 检查是否为Windows系统
 */
function isWindows() {
    return process.platform === 'win32';
}

/**
 * 查找所有固件（统一入口）
 * 如果配置了 firmwarePath，只查找配置路径
 * 否则查找工作空间的 quectel_build/release
 */
function findAllFirmwares() {
    const firmwares = [];
    const config = loadConfig();
    
    // 1. 检查配置文件（如果配置了路径，只检查配置的路径）
    if (config.firmwarePath) {
        if (fs.existsSync(config.firmwarePath)) {
            const stats = fs.statSync(config.firmwarePath);
            if (stats.isDirectory()) {
                const files = fs.readdirSync(config.firmwarePath);
                for (const file of files) {
                    const filePath = path.join(config.firmwarePath, file);
                    if (fs.statSync(filePath).isFile() && isFirmwareFile(file)) {
                        firmwares.push(createFirmwareInfo(filePath));
                    }
                }
            } else if (stats.isFile() && isFirmwareFile(config.firmwarePath)) {
                firmwares.push(createFirmwareInfo(config.firmwarePath));
            }
        }
        // 配置了路径，不再检查默认路径
        return firmwares;
    }
    
    // 2. 未配置路径时，检查工作空间的quectel_build/release目录
    const workspacePath = findWorkspacePath();
    if (workspacePath) {
        const releasePath = path.join(workspacePath, 'quectel_build', 'release');
        if (fs.existsSync(releasePath)) {
            const dirs = fs.readdirSync(releasePath);
            for (const dir of dirs) {
                const dirPath = path.join(releasePath, dir);
                if (fs.statSync(dirPath).isDirectory()) {
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        if (fs.statSync(filePath).isFile() && isFirmwareFile(file)) {
                            firmwares.push(createFirmwareInfo(filePath));
                        }
                    }
                }
            }
        }
    }
    
    return firmwares;
}

/**
 * 自动查找固件路径（返回最优的一个）
 */
function findFirmwareAuto() {
    const allFirmwares = findAllFirmwares();
    
    if (allFirmwares.length === 0) {
        return null;
    }
    
    // 排序：优先选择不带 "factory" 的包，然后按时间倒序
    const sortedFirmwares = allFirmwares.sort((a, b) => {
        const aIsFactory = a.name.toLowerCase().includes('factory');
        const bIsFactory = b.name.toLowerCase().includes('factory');
        
        // 非 factory 优先
        if (aIsFactory && !bIsFactory) return 1;
        if (!aIsFactory && bIsFactory) return -1;
        
        // 相同类型按时间倒序
        return b.mtime - a.mtime;
    });
    
    return sortedFirmwares[0].path;
}

/**
 * 判断是否为固件文件
 */
function isFirmwareFile(filename) {
    const lower = filename.toLowerCase();
    return lower.endsWith('_fbf.bin') || 
           lower.endsWith('.pac') || 
           lower.endsWith('.zip') || 
           lower.endsWith('download_usb.ini');
}

/**
 * 检查ZIP文件是否为adownload格式
 */
function zipIsAdownloadFile(file_name) {
    if (file_name.match(/.*\.zip$/i)) {
        try {
            const zip = new admzip(file_name);
            const zip_entries = zip.getEntries();
            const has_download_json = zip_entries.some(entry => {
                return entry.entryName === 'download.json' || 
                       entry.entryName.endsWith('/download.json');
            });
            return has_download_json;
        } catch (error) {
            console.error(`ZIP file check failed: ${error.message}`);
        }
    }
    return false;
}

/**
 * 确定固件类型和文件
 */
function determineFirmwareType(fileOrPath) {
    const filePath = fileOrPath;
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
        const files = fs.readdirSync(filePath);
        
        // ASR 1X03
        const fbfFile = files.find(f => f.toLowerCase().endsWith('_fbf.bin'));
        if (fbfFile) {
            return {
                type: 'fbf',
                file: path.join(filePath, fbfFile)
            };
        }
        
        // UNISOC 8310 8910
        const pacFile = files.find(f => f.toLowerCase().endsWith('.pac'));
        if (pacFile) {
            return {
                type: 'pac',
                file: path.join(filePath, pacFile)
            };
        }
        
        // ASR 160X
        const zipFile = files.find(f => f.toLowerCase().endsWith('.zip'));
        if (zipFile) {
            const zipPath = path.join(filePath, zipFile);
            if (zipIsAdownloadFile(zipPath)) {
                return {
                    type: 'ad',
                    file: zipPath
                };
            }
        }
        
        // Eigen
        const ecfFile = files.find(f => f.toLowerCase().endsWith('download_usb.ini'));
        if (ecfFile) {
            return {
                type: 'ecf',
                file: path.join(filePath, ecfFile)
            };
        }
        
        throw new Error('未找到支持的固件文件');
    } else {
        // 是文件
        if (zipIsAdownloadFile(filePath)) {
            return { type: 'ad', file: filePath };
        } else if (filePath.match(/.*\_fbf.bin$/i)) {
            return { type: 'fbf', file: filePath };
        } else if (filePath.match(/.*\.pac$/i)) {
            return { type: 'pac', file: filePath };
        } else if (filePath.match(/.*\_download_usb.ini$/i)) {
            return { type: 'ecf', file: filePath };
        }
        
        throw new Error('不支持的固件文件类型');
    }
}

/**
 * 加载配置文件
 */
function loadConfig() {
    // 尝试加载带点的配置文件（优先）
    const configPathWithDot = path.join(process.cwd(), 'firmware-cli.json');
    if (fs.existsSync(configPathWithDot)) {
        try {
            return JSON.parse(fs.readFileSync(configPathWithDot, 'utf8'));
        } catch (error) {
            console.error('配置文件解析失败:', error.message);
        }
    }
    
    return {};
}

/**
 * 保存配置文件
 */
function saveConfig(config) {
    const configPath = path.join(process.cwd(), 'firmware-cli.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * 杀死进程树
 */
function killProcessTree(childProcess, signal = 'SIGKILL') {
    return new Promise((resolve, reject) => {
        if (!childProcess || !childProcess.pid) {
            resolve();
            return;
        }
        
        if (isWindows()) {
            const taskkill = spawn('taskkill', ['/PID', childProcess.pid, '/T', '/F'], { shell: true });
            taskkill.on('close', (code) => {
                if (code === 0 || code === 128) {
                    resolve();
                } else {
                    reject(new Error(`taskkill failed with code ${code}`));
                }
            });
            taskkill.on('error', reject);
        } else {
            try {
                childProcess.kill(signal);
                resolve();
            } catch (error) {
                reject(error);
            }
        }
    });
}

/**
 * 执行命令
 * @param {string} command - 命令
 * @param {string[]} args - 参数
 * @param {Object} options - 选项
 * @param {boolean} options.silent - 是否静默输出
 * @param {boolean} options.autoPressKey - 是否自动按键（用于跳过 pause 命令）
 */
function executeCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { 
            shell: true,
            ...options
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            let output;
            if (isWindows()) {
                output = iconv.decode(data, 'gbk');
            } else {
                output = data.toString('utf8');
            }
            stdout += output;
            if (!options.silent) {
                process.stdout.write(output);
            }
            
            // 自动处理 pause 命令：检测到 "请按任意键继续" 或 "Press any key" 时自动发送按键
            if (options.autoPressKey !== false) {
                const lowerOutput = output.toLowerCase();
                if (lowerOutput.includes('请按任意键继续') || 
                    lowerOutput.includes('press any key') ||
                    lowerOutput.includes('pause')) {
                    // 发送回车键来跳过 pause
                    if (child.stdin && !child.stdin.destroyed) {
                        child.stdin.write('\n');
                    }
                }
            }
        });
        
        child.stderr.on('data', (data) => {
            let output;
            if (isWindows()) {
                output = iconv.decode(data, 'gbk');
            } else {
                output = data.toString('utf8');
            }
            stderr += output;
            if (!options.silent) {
                process.stderr.write(output);
            }
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
        
        child.on('error', reject);
    });
}

module.exports = {
    // 工具配置相关
    loadToolsConfig,
    getToolConfig,
    getPlatformConfig,
    getToolPath,
    buildToolArgs,
    getSupportedPlatforms,
    determinePlatformByFirmware,
    getGlobalSettings,
    
    // 原有功能
    getProjectRoot,
    getToolsPath,
    isWindows,
    findWorkspacePath,
    findFirmwareAuto,
    findAllFirmwares,
    formatSize,
    isFirmwareFile,
    zipIsAdownloadFile,
    determineFirmwareType,
    loadConfig,
    saveConfig,
    killProcessTree,
    executeCommand
};
