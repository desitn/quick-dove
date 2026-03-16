const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const iconv = require('iconv-lite');
const admzip = require('adm-zip');

/** 下载工具路径配置 */
const tool_set = {
    'ddl': 'detect_dl.exe',
    'ad': 'adownload.exe',
    'fbf': 'FBFDownloader.exe',
    'pac': 'pacdownload\\CmdDloader.exe',
    'ecf': 'ecflashtool\\ECFlashTool.exe'
};

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
 * 自动查找固件路径
 */
function findFirmwareAuto() {
    // 1. 检查配置文件
    const config = loadConfig();
    if (config.firmwarePath && fs.existsSync(config.firmwarePath)) {
        const stats = fs.statSync(config.firmwarePath);
        if (stats.isDirectory()) {
            const files = fs.readdirSync(config.firmwarePath);
            const firmwareFile = files.find(f => isFirmwareFile(f));
            if (firmwareFile) {
                return path.join(config.firmwarePath, firmwareFile);
            }
        } else if (stats.isFile() && isFirmwareFile(config.firmwarePath)) {
            return config.firmwarePath;
        }
    }
    
    // 2. 检查工作空间的quectel_build/release目录
    const workspacePath = findWorkspacePath();
    if (workspacePath) {
        const releasePath = path.join(workspacePath, 'quectel_build', 'release');
        if (fs.existsSync(releasePath)) {
            const dirs = fs.readdirSync(releasePath);
            if (dirs.length > 0) {
                // 找最新的目录
                const latestDir = dirs.sort((a, b) => {
                    const timeA = fs.statSync(path.join(releasePath, a)).mtime;
                    const timeB = fs.statSync(path.join(releasePath, b)).mtime;
                    return timeB - timeA;
                })[0];
                
                const dirPath = path.join(releasePath, latestDir);
                const files = fs.readdirSync(dirPath);
                const firmwareFile = files.find(f => isFirmwareFile(f));
                if (firmwareFile) {
                    return path.join(dirPath, firmwareFile);
                }
            }
        }
    }
    
    return null;
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
    const configPath = path.join(process.cwd(), '.firmware-cli.json');
    if (fs.existsSync(configPath)) {
        try {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
    const configPath = path.join(process.cwd(), '.firmware-cli.json');
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
    tool_set,
    getProjectRoot,
    getToolsPath,
    isWindows,
    findWorkspacePath,
    findFirmwareAuto,
    isFirmwareFile,
    zipIsAdownloadFile,
    determineFirmwareType,
    loadConfig,
    saveConfig,
    killProcessTree,
    executeCommand
};