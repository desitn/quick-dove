const fs = require('fs');
const path = require('path');
const { 
    findWorkspacePath, 
    isFirmwareFile,
    loadConfig
} = require('./utils');

/**
 * 列出可用固件
 */
async function listFirmware() {
    const firmwares = [];
    
    // 1. 检查配置文件中的路径
    const config = loadConfig();
    if (config.firmwarePath && fs.existsSync(config.firmwarePath)) {
        const configFirmwares = scanDirectory(config.firmwarePath);
        firmwares.push(...configFirmwares);
    }
    
    // 2. 检查工作空间的quectel_build/release目录
    const workspacePath = findWorkspacePath();
    if (workspacePath) {
        const releasePath = path.join(workspacePath, 'quectel_build', 'release');
        if (fs.existsSync(releasePath)) {
            const workspaceFirmwares = scanReleaseDirectory(releasePath);
            firmwares.push(...workspaceFirmwares);
        }
    }
    
    // 去重
    const uniqueFirmwares = [];
    const seen = new Set();
    for (const fw of firmwares) {
        if (!seen.has(fw.path)) {
            seen.add(fw.path);
            uniqueFirmwares.push(fw);
        }
    }
    
    if (uniqueFirmwares.length === 0) {
        console.log('未找到固件文件');
        console.log('提示: 配置.firmware-cli.json文件或使用flash <路径>命令指定固件');
    } else {
        console.log(`找到 ${uniqueFirmwares.length} 个固件:`);
        uniqueFirmwares.forEach((fw, index) => {
            console.log(`${index + 1}. ${fw.name}`);
            console.log(`   路径: ${fw.path}`);
            console.log(`   类型: ${fw.type}`);
            console.log(`   大小: ${formatSize(fw.size)}`);
            console.log(`   时间: ${fw.time}`);
            console.log();
        });
        
        // 推荐最新的固件
        const latest = uniqueFirmwares.sort((a, b) => b.mtime - a.mtime)[0];
        console.log(`最新固件: ${latest.name}`);
        console.log(`烧录命令: firmware-cli.exe flash "${latest.path}"`);
    }
    
    return uniqueFirmwares;
}

/**
 * 扫描目录查找固件
 */
function scanDirectory(dirPath) {
    const firmwares = [];
    
    if (!fs.existsSync(dirPath)) {
        return firmwares;
    }
    
    const stats = fs.statSync(dirPath);
    
    if (stats.isFile() && isFirmwareFile(dirPath)) {
        firmwares.push(createFirmwareInfo(dirPath));
        return firmwares;
    }
    
    if (stats.isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            if (fs.statSync(filePath).isFile() && isFirmwareFile(file)) {
                firmwares.push(createFirmwareInfo(filePath));
            }
        }
    }
    
    return firmwares;
}

/**
 * 扫描release目录
 */
function scanReleaseDirectory(releasePath) {
    const firmwares = [];
    
    if (!fs.existsSync(releasePath)) {
        return firmwares;
    }
    
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
    
    return firmwares;
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
 * 格式化文件大小
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
    listFirmware
};